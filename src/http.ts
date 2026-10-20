// Cliente HTTP común de las fuentes oficiales: una petición cada vez, identificada, con reintentos y esperas.
// Solo biblioteca estándar (fetch, AbortSignal). Cada fuente (sources/*.ts) construye sus URL con un host constante
// y solo fechas validadas; este módulo no compone ninguna URL.
import { BoeError, errName } from "./errors.ts";

export const USER_AGENT = "normawatch-boe/1.6 (+https://github.com/saidcveltran/normawatch-boe)";

export const TIMEOUT_MS = 30_000;
export const MAX_BYTES = 4 * 1024 * 1024;
const BACKOFF_MS = [2000, 4000, 8000];
const MAX_RETRY_AFTER_MS = 60_000;

export type FetchOptions = {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxBytes?: number;
  timeoutMs?: number;
  // Pausa entre peticiones: los reintentos nunca esperan menos.
  requestDelayMs?: number;
  // Memoria de la ejecución para fuentes que sirven siempre el mismo documento (DOG).
  memo?: Map<string, unknown>;
};

export type FetchResult = { status: "ok"; body: unknown; requests: number } | { status: "empty"; requests: number };

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Fallo por límite de peticiones o error del servidor (429/5xx): el día falla y la ejecución lo cuenta.
export class RateLimitError extends BoeError {}

// Cómo se pide y se lee el documento de una fuente.
export type DocumentSpec = {
  // Nombre que aparece en los mensajes («el BOE», «el BOJA»).
  label: string;
  accept: string;
  // Fragmento que debe contener el tipo de contenido de la respuesta.
  contentType: string;
  // Cómo se interpreta el cuerpo: JSON o texto (XML/RSS).
  parse: "json" | "text";
  // Estado que significa «sin boletín ese día». Con emptyBody, además, el cuerpo debe ser el conocido.
  emptyStatus: number;
  emptyBody?: (text: string) => boolean;
};

// Espera antes del siguiente intento: el paso de espera, o Retry-After si es mayor, y nunca menos que
// la pausa entre peticiones. Un Retry-After por encima de 60 s no se espera: el día falla.
function retryDelay(res: Response, attempt: number, requestDelayMs: number, isoDate: string, label: string): number {
  const header = res.headers.get("retry-after");
  let wait = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
  if (header !== null && /^\d{1,5}$/.test(header.trim())) {
    const asked = Number(header.trim()) * 1000;
    if (asked > MAX_RETRY_AFTER_MS) {
      throw new RateLimitError(`el ${label} pide esperar más de 60 s (Retry-After) para el ${isoDate}`);
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

// Pide una URL ya construida por la fuente. isoDate solo sirve para los mensajes.
export async function fetchDocument(url: string, isoDate: string, spec: DocumentSpec, options: FetchOptions = {}): Promise<FetchResult> {
  const doFetch = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const { label } = spec;
  let requests = 0;
  for (let attempt = 0; ; attempt++) {
    requests++;
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "GET",
        headers: { Accept: spec.accept, "User-Agent": USER_AGENT },
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (err) {
      throw new BoeError(`falló la petición del ${isoDate} (${errName(err)})`, { cause: errName(err) });
    }
    if (res.status === spec.emptyStatus) {
      if (spec.emptyBody === undefined) {
        await res.body?.cancel();
        return { status: "empty", requests };
      }
      let text: string;
      try {
        text = await readCapped(res, 4096);
      } catch {
        throw new BoeError(`el ${label} respondió ${res.status} para el ${isoDate}`);
      }
      if (spec.emptyBody(text)) return { status: "empty", requests };
      throw new BoeError(`el ${label} respondió ${res.status} para el ${isoDate}`);
    }
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel();
      if (attempt >= BACKOFF_MS.length) throw new RateLimitError(`el ${label} respondió ${res.status} para el ${isoDate} tras los reintentos`);
      await sleep(retryDelay(res, attempt, options.requestDelayMs ?? 0, isoDate, label));
      continue;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new BoeError(`el ${label} respondió ${res.status} para el ${isoDate}`);
    }
    if (!(res.headers.get("content-type") ?? "").toLowerCase().includes(spec.contentType)) {
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
    if (spec.parse === "text") return { status: "ok", body, requests };
    try {
      return { status: "ok", body: JSON.parse(body) as unknown, requests };
    } catch {
      throw new BoeError(`JSON no válido para el ${isoDate}`);
    }
  }
}
