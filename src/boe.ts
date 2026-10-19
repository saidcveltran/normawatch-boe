// BOE open data client and parser. Standard library only (built-in fetch, Intl, JSON).
// The only URL ever requested is BASE_URL plus a date that passed strict validation.

export const SOURCE_LINE = "Fuente de los datos: Agencia Estatal Boletín Oficial del Estado";
export const SOURCE_URL = "https://www.boe.es";
export const BASE_URL = "https://www.boe.es/datosabiertos/api/boe/sumario/";
export const USER_AGENT = "normawatch-boe/0.1 (+https://aiskaron.com/en/tools/normawatch-boe/)";

const TIMEOUT_MS = 30_000;
export const MAX_BYTES = 4 * 1024 * 1024;
const BACKOFF_MS = [2000, 4000, 8000];
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_RANGE_DAYS = 31;
const MAX_TEXT = 2000;
const BOE_HOST = "www.boe.es";

export class BoeError extends Error {
  constructor(message: string, options?: { cause?: string }) {
    super(message, options);
    this.name = "BoeError";
  }
}

export function errName(err: unknown): string {
  return err instanceof Error && err.name ? err.name : "UnknownError";
}

export type OutputItem = {
  id: string;
  date: string;
  section: "1";
  department: string;
  epigraph: string;
  title: string;
  urlHtml: string;
  urlPdf: string;
  urlXml: string;
  retrievedAt: string;
  source: string;
  sourceUrl: string;
};

export type Dropped = { badId: number; badUrl: number };

export type RunInput = { dates: string[]; maxItems: number; requestDelayMs: number };

// ---------- dates and input ----------

function validDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function dayNumber(value: string): number {
  return Math.round(Date.parse(`${value}T00:00:00Z`) / 86_400_000);
}

function addDays(value: string, days: number): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function madridToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function buildSumarioUrl(isoDate: string): string {
  if (typeof isoDate !== "string" || !validDate(isoDate)) throw new BoeError("invalid date");
  return BASE_URL + isoDate.replaceAll("-", "");
}

function intField(input: Record<string, unknown>, name: string, def: number, min: number, max: number): number {
  const v = input[name];
  if (v === undefined || v === null) return def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new BoeError(`${name} must be an integer from ${min} to ${max}`);
  }
  return v;
}

function dateField(input: Record<string, unknown>, name: string): string | undefined {
  const v = input[name];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !validDate(v)) throw new BoeError(`${name} must be a date as YYYY-MM-DD`);
  return v;
}

export function parseInput(input: Record<string, unknown>, today: string): RunInput {
  const from = dateField(input, "dateFrom") ?? today;
  const to = dateField(input, "dateTo") ?? from;
  if (dayNumber(from) > dayNumber(today)) throw new BoeError("dateFrom must not be after today (future date)");
  if (dayNumber(to) > dayNumber(today)) throw new BoeError("dateTo must not be after today (future date)");
  if (dayNumber(to) < dayNumber(from)) throw new BoeError("dateTo must not be before dateFrom");
  if (dayNumber(to) - dayNumber(from) > MAX_RANGE_DAYS) {
    throw new BoeError(`dateTo must be at most ${MAX_RANGE_DAYS} days after dateFrom`);
  }
  const dates: string[] = [];
  for (let d = from; dayNumber(d) <= dayNumber(to); d = addDays(d, 1)) dates.push(d);
  return {
    dates,
    maxItems: intField(input, "maxItems", 500, 1, 10_000),
    requestDelayMs: intField(input, "requestDelayMs", 1000, 500, 10_000),
  };
}

// ---------- client ----------

export type FetchOptions = {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxBytes?: number;
  timeoutMs?: number;
};

export type FetchResult = { status: "ok"; body: unknown; requests: number } | { status: "empty"; requests: number };

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  const step = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
  if (header !== null && /^\d{1,5}$/.test(header.trim())) {
    return Math.min(Math.max(Number(header.trim()) * 1000, step), MAX_RETRY_AFTER_MS);
  }
  return step;
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new BoeError("response too large");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let chunk: Awaited<ReturnType<typeof reader.read>>;
    try {
      chunk = await reader.read();
    } catch (err) {
      throw new BoeError(`reading the response failed (${errName(err)})`, { cause: errName(err) });
    }
    if (chunk.done) break;
    const value = chunk.value;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BoeError("response too large");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

export async function fetchSumario(isoDate: string, options: FetchOptions = {}): Promise<FetchResult> {
  const url = buildSumarioUrl(isoDate);
  const doFetch = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  let requests = 0;
  for (let attempt = 0; ; attempt++) {
    requests++;
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (err) {
      throw new BoeError(`request failed for ${isoDate} (${errName(err)})`, { cause: errName(err) });
    }
    if (res.status === 404) {
      await res.body?.cancel();
      return { status: "empty", requests };
    }
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel();
      if (attempt >= BACKOFF_MS.length) throw new BoeError(`BOE answered ${res.status} for ${isoDate} after retries`);
      await sleep(retryDelay(res, attempt));
      continue;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new BoeError(`BOE answered ${res.status} for ${isoDate}`);
    }
    if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      await res.body?.cancel();
      throw new BoeError(`unexpected content type for ${isoDate}`);
    }
    let text: string;
    try {
      text = await readCapped(res, maxBytes);
    } catch (err) {
      if (err instanceof BoeError) throw new BoeError(`${err.message} for ${isoDate}`, err.cause === undefined ? undefined : { cause: String(err.cause) });
      throw new BoeError(`reading the response failed for ${isoDate} (${errName(err)})`, { cause: errName(err) });
    }
    try {
      return { status: "ok", body: JSON.parse(text) as unknown, requests };
    } catch {
      throw new BoeError(`invalid JSON for ${isoDate}`);
    }
  }
}

// ---------- run loop ----------

export type RunDeps = {
  fetchDay: (date: string) => Promise<FetchResult>;
  push: (items: OutputItem[]) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => string;
  log: {
    info: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
  };
};

export type RunSummary = {
  exitCode: number;
  requests: number;
  stored: number;
  failedDays: number;
  failedDates: string[];
};

// A BoeError fails only its day; anything else is unexpected: log its name, stop, exit code 1.
export async function runDays(input: RunInput, deps: RunDeps): Promise<RunSummary> {
  const summary: RunSummary = { exitCode: 0, requests: 0, stored: 0, failedDays: 0, failedDates: [] };
  for (let i = 0; i < input.dates.length && summary.stored < input.maxItems; i++) {
    const date = input.dates[i]!;
    if (i > 0) await deps.sleep(input.requestDelayMs);
    try {
      const result = await deps.fetchDay(date);
      summary.requests += result.requests;
      if (result.status === "empty") {
        deps.log.info("No BOE for this day", { date });
        continue;
      }
      const { items, dropped } = parseSumario(result.body, date, deps.now());
      const room = items.slice(0, input.maxItems - summary.stored);
      if (room.length > 0) await deps.push(room);
      summary.stored += room.length;
      deps.log.info("Day done", { date, found: items.length, stored: room.length, ...dropped });
    } catch (err) {
      if (err instanceof BoeError) {
        summary.failedDays++;
        summary.failedDates.push(date);
        deps.log.error("Day failed", { date, reason: err.message });
      } else {
        deps.log.error("Unexpected error", { date, name: errName(err) });
        summary.exitCode = 1;
        return summary;
      }
    }
  }
  deps.log.info("Run finished", {
    days: input.dates.length,
    requests: summary.requests,
    stored: summary.stored,
    failedDays: summary.failedDays,
  });
  if (summary.failedDays > 0 && summary.failedDays === input.dates.length) summary.exitCode = 1;
  return summary;
}

// ---------- parser ----------

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// The API returns a single object where there is one entry and an array where there are several.
function many(v: unknown): Obj[] {
  if (Array.isArray(v)) return v.filter(isObj);
  return isObj(v) ? [v] : [];
}

function text(v: unknown): string {
  return typeof v === "string" ? v.slice(0, MAX_TEXT) : "";
}

function boeUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== BOE_HOST || u.port !== "" || u.username !== "" || u.password !== "") {
    return null;
  }
  return u.href;
}

export function parseSumario(json: unknown, date: string, retrievedAt: string): { items: OutputItem[]; dropped: Dropped } {
  if (!isObj(json) || !isObj(json["data"]) || !isObj(json["data"]["sumario"])) {
    throw new BoeError("unexpected summary document");
  }
  const diarios = json["data"]["sumario"]["diario"];
  if (!Array.isArray(diarios)) throw new BoeError("unexpected summary document: no diario");
  const items: OutputItem[] = [];
  const dropped: Dropped = { badId: 0, badUrl: 0 };
  for (const diario of many(diarios)) {
    for (const seccion of many(diario["seccion"])) {
      if (seccion["codigo"] !== "1") continue;
      for (const dep of many(seccion["departamento"])) {
        const groups: { epigraph: string; entries: Obj[] }[] = [
          { epigraph: "", entries: many(dep["item"]) },
          ...many(dep["epigrafe"]).map((ep) => ({ epigraph: text(ep["nombre"]), entries: many(ep["item"]) })),
        ];
        for (const group of groups) {
          for (const entry of group.entries) {
            const id = entry["identificador"];
            if (typeof id !== "string" || !/^BOE-A-[0-9]{4}-[0-9]+$/.test(id)) {
              dropped.badId++;
              continue;
            }
            const pdf = isObj(entry["url_pdf"]) ? entry["url_pdf"]["texto"] : undefined;
            const urlHtml = boeUrl(entry["url_html"]);
            const urlPdf = boeUrl(pdf);
            const urlXml = boeUrl(entry["url_xml"]);
            if (urlHtml === null || urlPdf === null || urlXml === null) {
              dropped.badUrl++;
              continue;
            }
            items.push({
              id,
              date,
              section: "1",
              department: text(dep["nombre"]),
              epigraph: group.epigraph,
              title: text(entry["titulo"]),
              urlHtml,
              urlPdf,
              urlXml,
              retrievedAt,
              source: SOURCE_LINE,
              sourceUrl: SOURCE_URL,
            });
          }
        }
      }
    }
  }
  return { items, dropped };
}
