// Cliente HTTP de datos abiertos del BOE: una petición cada vez, identificada, con reintentos y esperas.
// Solo biblioteca estándar (fetch, AbortSignal). La única URL que se solicita es BASE_URL más una
// fecha que ha pasado una validación estricta.
import { BoeError, errName } from "./errors.ts";
import { validDate } from "./input.ts";

export const BASE_URL = "https://www.boe.es/datosabiertos/api/boe/sumario/";
export const USER_AGENT = "normawatch-boe/1.3 (+https://aiskaron.com/en/tools/normawatch-boe/)";

export const TIMEOUT_MS = 30_000;
export const MAX_BYTES = 4 * 1024 * 1024;
const BACKOFF_MS = [2000, 4000, 8000];
const MAX_RETRY_AFTER_MS = 60_000;

export function buildSumarioUrl(isoDate: string): string {
  if (typeof isoDate !== "string" || !validDate(isoDate)) throw new BoeError("fecha no válida");
  return BASE_URL + isoDate.replaceAll("-", "");
}

export type FetchOptions = {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxBytes?: number;
  timeoutMs?: number;
  // Pausa entre peticiones: los reintentos nunca esperan menos.
  requestDelayMs?: number;
};

export type FetchResult = { status: "ok"; body: unknown; requests: number } | { status: "empty"; requests: number };

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Fallo por límite de peticiones o error del servidor (429/5xx): el día falla y la ejecución lo cuenta.
export class RateLimitError extends BoeError {}

// Espera antes del siguiente intento: el paso de espera, o Retry-After si es mayor, y nunca menos que
// la pausa entre peticiones. Un Retry-After por encima de 60 s no se espera: el día falla.
function retryDelay(res: Response, attempt: number, requestDelayMs: number, isoDate: string): number {
  const header = res.headers.get("retry-after");
  let wait = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
  if (header !== null && /^\d{1,5}$/.test(header.trim())) {
    const asked = Number(header.trim()) * 1000;
    if (asked > MAX_RETRY_AFTER_MS) {
      throw new RateLimitError(`el BOE pide esperar más de 60 s (Retry-After) para el ${isoDate}`);
    }
    wait = Math.max(asked, wait);
  }
  return Math.max(wait, requestDelayMs);
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
      if (attempt >= BACKOFF_MS.length) throw new RateLimitError(`el BOE respondió ${res.status} para el ${isoDate} tras los reintentos`);
      await sleep(retryDelay(res, attempt, options.requestDelayMs ?? 0, isoDate));
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
