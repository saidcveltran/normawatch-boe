// Cliente de datos abiertos del BOE y bucle de ejecución. Solo biblioteca estándar (fetch, Intl, JSON).
// La única URL que se solicita es BASE_URL más una fecha que ha pasado una validación estricta.
import { BoeError, errName } from "./errors.ts";
import { dropMessages, parseSumario } from "./parse.ts";
import type { OutputItem } from "./parse.ts";

export { BoeError, errName };

export const BASE_URL = "https://www.boe.es/datosabiertos/api/boe/sumario/";
export const USER_AGENT = "normawatch-boe/0.1 (+https://aiskaron.com/en/tools/normawatch-boe/)";

const TIMEOUT_MS = 30_000;
export const MAX_BYTES = 4 * 1024 * 1024;
const BACKOFF_MS = [2000, 4000, 8000];
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_RANGE_DAYS = 31;

export type RunInput = { dates: string[]; maxItems: number; requestDelayMs: number };

// ---------- fechas y entrada ----------

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
  if (typeof isoDate !== "string" || !validDate(isoDate)) throw new BoeError("fecha no válida");
  return BASE_URL + isoDate.replaceAll("-", "");
}

function intField(input: Record<string, unknown>, name: string, def: number, min: number, max: number): number {
  const v = input[name];
  if (v === undefined || v === null) return def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new BoeError(`${name} debe ser un entero entre ${min} y ${max}`);
  }
  return v;
}

function dateField(input: Record<string, unknown>, name: string): string | undefined {
  const v = input[name];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !validDate(v)) throw new BoeError(`${name} debe ser una fecha con formato AAAA-MM-DD`);
  return v;
}

export function parseInput(input: Record<string, unknown>, today: string): RunInput {
  const from = dateField(input, "dateFrom") ?? today;
  const to = dateField(input, "dateTo") ?? from;
  if (dayNumber(from) > dayNumber(today)) throw new BoeError("dateFrom no puede ser posterior a hoy (fecha futura)");
  if (dayNumber(to) > dayNumber(today)) throw new BoeError("dateTo no puede ser posterior a hoy (fecha futura)");
  if (dayNumber(to) < dayNumber(from)) throw new BoeError("dateTo no puede ser anterior a dateFrom");
  if (dayNumber(to) - dayNumber(from) > MAX_RANGE_DAYS) {
    throw new BoeError(`dateTo debe ser como máximo ${MAX_RANGE_DAYS} días posterior a dateFrom`);
  }
  const dates: string[] = [];
  for (let d = from; dayNumber(d) <= dayNumber(to); d = addDays(d, 1)) dates.push(d);
  return {
    dates,
    maxItems: intField(input, "maxItems", 500, 1, 10_000),
    requestDelayMs: intField(input, "requestDelayMs", 1000, 500, 10_000),
  };
}

// ---------- cliente ----------

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
  if (declared > maxBytes) throw new BoeError("respuesta demasiado grande");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let chunk: Awaited<ReturnType<typeof reader.read>>;
    try {
      chunk = await reader.read();
    } catch (err) {
      throw new BoeError(`falló la lectura de la respuesta (${errName(err)})`, { cause: errName(err) });
    }
    if (chunk.done) break;
    const value = chunk.value;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BoeError("respuesta demasiado grande");
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
      throw new BoeError(`falló la petición del ${isoDate} (${errName(err)})`, { cause: errName(err) });
    }
    if (res.status === 404) {
      await res.body?.cancel();
      return { status: "empty", requests };
    }
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel();
      if (attempt >= BACKOFF_MS.length) throw new BoeError(`el BOE respondió ${res.status} para el ${isoDate} tras los reintentos`);
      await sleep(retryDelay(res, attempt));
      continue;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new BoeError(`el BOE respondió ${res.status} para el ${isoDate}`);
    }
    if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      await res.body?.cancel();
      throw new BoeError(`tipo de contenido inesperado para el ${isoDate}`);
    }
    let body: string;
    try {
      body = await readCapped(res, maxBytes);
    } catch (err) {
      if (err instanceof BoeError) throw new BoeError(`${err.message} (${isoDate})`, err.cause === undefined ? undefined : { cause: String(err.cause) });
      throw new BoeError(`falló la lectura de la respuesta del ${isoDate} (${errName(err)})`, { cause: errName(err) });
    }
    try {
      return { status: "ok", body: JSON.parse(body) as unknown, requests };
    } catch {
      throw new BoeError(`JSON no válido para el ${isoDate}`);
    }
  }
}

// ---------- bucle de ejecución ----------

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

// Un BoeError solo hace fallar su día; cualquier otro error es inesperado: se registra su nombre,
// se detiene la ejecución y el código de salida es 1. El registro lleva solo recuentos, fechas y
// estados, nunca texto de títulos.
export async function runDays(input: RunInput, deps: RunDeps): Promise<RunSummary> {
  const summary: RunSummary = { exitCode: 0, requests: 0, stored: 0, failedDays: 0, failedDates: [] };
  for (let i = 0; i < input.dates.length && summary.stored < input.maxItems; i++) {
    const date = input.dates[i]!;
    if (i > 0) await deps.sleep(input.requestDelayMs);
    try {
      const result = await deps.fetchDay(date);
      summary.requests += result.requests;
      if (result.status === "empty") {
        deps.log.info("Sin BOE este día", { date });
        continue;
      }
      const { items, dropped } = parseSumario(result.body, date, deps.now());
      const room = items.slice(0, input.maxItems - summary.stored);
      if (room.length > 0) await deps.push(room);
      summary.stored += room.length;
      for (const message of dropMessages(dropped)) deps.log.info(message, { date });
      deps.log.info("Día completado", { date, found: items.length, stored: room.length, ...dropped });
    } catch (err) {
      if (err instanceof BoeError) {
        summary.failedDays++;
        summary.failedDates.push(date);
        deps.log.error("Día fallido", { date, reason: err.message });
      } else {
        deps.log.error("Error inesperado", { date, name: errName(err) });
        summary.exitCode = 1;
        return summary;
      }
    }
  }
  deps.log.info("Ejecución terminada", {
    days: input.dates.length,
    requests: summary.requests,
    stored: summary.stored,
    failedDays: summary.failedDays,
  });
  if (summary.failedDays > 0 && summary.failedDays === input.dates.length) summary.exitCode = 1;
  return summary;
}
