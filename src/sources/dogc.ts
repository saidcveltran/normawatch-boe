// Fuente DOGC (Generalitat de Catalunya): conjunto «Normativa del DOGC i del Portal Jurídic de Catalunya» del portal de datos
// abiertos (Socrata), JSON, Llicència oberta d'ús d'informació - Catalunya. Una consulta por fecha de publicación, ordenada
// por número de control y paginada con $offset. Solo contiene leyes, decretos-ley, decretos, decretos legislativos y órdenes
// (sección 1 del DOGC): no hay resoluciones ni departamento. No se pide texto íntegro: solo metadatos y enlaces al Portal Jurídic.
import { BoeError } from "../errors.ts";
import { normTypeOf } from "../classify.ts";
import type { NormType } from "../classify.ts";
import { validDate } from "../dates.ts";
import { fetchDocument } from "../http.ts";
import type { DocumentSpec, FetchOptions, FetchResult } from "../http.ts";
import { MAX_TEXT, isObj, nameGuardHit, text } from "../parse.ts";
import type { Dropped, OutputItem } from "../parse.ts";
import type { SourceAdapter } from "./types.ts";

export const DOGC_HOST = "analisi.transparenciacatalunya.cat";
export const DOGC_LINK_HOST = "portaljuridic.gencat.cat";
export const DOGC_SOURCE_LINE = "Fuente: Generalitat de Catalunya. Entitat Autònoma del Diari Oficial i de Publicacions de la Generalitat de Catalunya (EADOP)";
export const DOGC_SOURCE_URL = "https://web.gencat.cat/ca/generalitat/dades-indicadors/dades-obertes/llicencies";
export const DOGC_LICENCE_NAME = "Llicència oberta d'ús d'informació - Catalunya";
export const DOGC_NOT_ENDORSED = "La Generalitat de Catalunya no participa en NormaWatch ni lo respalda.";
const DATA_PATH = "/resource/n6hn-rmy7.json";
const META_PATH = "/api/views/n6hn-rmy7.json";
const PAGE_SIZE = 500;
const MAX_PAGES = 5;
const MEMO_UPDATED = "DOGC:updated";
const ID_FORMAT = /^[0-9]{1,20}$/;
const PUBLISHED_FORMAT = /^([0-9]{4}-[0-9]{2}-[0-9]{2})T00:00:00\.000$/;
const ISO_DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

// La fecha ya validada es lo único variable; la condición de Socrata (SoQL) se codifica entera.
export function buildDogcUrl(isoDate: string, page: number): string {
  if (typeof isoDate !== "string" || !validDate(isoDate)) throw new BoeError("fecha no válida");
  if (!Number.isInteger(page) || page < 0 || page >= MAX_PAGES) throw new BoeError("página no válida");
  const where = encodeURIComponent(`data_de_publicaci_del_diari='${isoDate}T00:00:00.000'`).replaceAll("'", "%27");
  const offset = page > 0 ? `&$offset=${page * PAGE_SIZE}` : "";
  return `https://${DOGC_HOST}${DATA_PATH}?$where=${where}&$order=n_mero_de_control&$limit=${PAGE_SIZE}${offset}`;
}

export const DOGC_META_URL = `https://${DOGC_HOST}${META_PATH}`;

// Un día sin boletín responde 200 con []: no hay estado de «vacío» propio (emptyStatus 0 no coincide con ninguna respuesta).
const SPEC: DocumentSpec = { label: "DOGC", accept: "application/json", contentType: "application/json", parse: "json", emptyStatus: 0 };

// Reloj inyectable para la prueba de la fecha de actualización.
export type DogcFetchOptions = FetchOptions & { now?: () => Date };
const FIRST_UPDATED_SECS = 1_420_070_400; // 2015-01-01T00:00:00Z
const DAY_SECS = 86_400;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const madridDay = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// Fecha de la última actualización del conjunto (rowsUpdatedAt, segundos desde 1970) como AAAA-MM-DD en Madrid.
// Una sola petición por ejecución; cualquier fallo o forma inesperada la omite (nunca hace fallar el día).
async function fetchUpdated(options: DogcFetchOptions, sleep: (ms: number) => Promise<void>): Promise<{ updated: string; requests: number }> {
  const memo = options.memo;
  const cached = memo?.get(MEMO_UPDATED);
  if (typeof cached === "string") return { updated: cached, requests: 0 };
  let requests = 0;
  const base = options.fetchFn ?? fetch;
  const counting: FetchOptions = {
    ...options,
    fetchFn: ((...args: Parameters<typeof fetch>) => {
      requests++;
      return base(...args);
    }) as typeof fetch,
  };
  let updated = "";
  try {
    await sleep(options.requestDelayMs ?? 1000);
    const res = await fetchDocument(DOGC_META_URL, "metadatos", SPEC, counting);
    const doc = res.status === "ok" ? res.body : undefined;
    const secs = isObj(doc) ? doc["rowsUpdatedAt"] : undefined;
    const nowSecs = Math.floor((options.now ?? (() => new Date()))().getTime() / 1000);
    if (typeof secs === "number" && Number.isInteger(secs) && secs >= FIRST_UPDATED_SECS && secs <= nowSecs + DAY_SECS) updated = madridDay(new Date(secs * 1000));
  } catch {
    updated = "";
  }
  memo?.set(MEMO_UPDATED, updated);
  return { updated, requests };
}

// Cuerpo que devuelve fetchDay: las filas del día y, si se pudo leer, la fecha de actualización del conjunto.
export async function fetchDogcDay(isoDate: string, options: DogcFetchOptions = {}): Promise<FetchResult> {
  const sleep = options.sleep ?? defaultSleep;
  const rows: unknown[] = [];
  let requests = 0;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) throw new BoeError(`el DOGC devolvió más de ${PAGE_SIZE * MAX_PAGES} elementos para el ${isoDate}`);
    if (page > 0) await sleep(options.requestDelayMs ?? 1000);
    const res = await fetchDocument(buildDogcUrl(isoDate, page), isoDate, SPEC, options);
    requests += res.requests;
    if (res.status !== "ok" || !Array.isArray(res.body)) throw new BoeError("documento del DOGC inesperado");
    const batch = res.body as unknown[];
    if (batch.length > PAGE_SIZE) throw new BoeError(`el DOGC devolvió una página de más de ${PAGE_SIZE} elementos para el ${isoDate}`);
    for (const entry of batch) rows.push(entry);
    if (batch.length < PAGE_SIZE) break;
  }
  if (rows.length === 0) return { status: "empty", requests };
  const meta = await fetchUpdated(options, sleep);
  requests += meta.requests;
  return { status: "ok", body: { rows, ...(meta.updated !== "" ? { sourceUpdated: meta.updated } : {}) }, requests };
}

const fold = (v: string): string => v.normalize("NFC").trim().toLowerCase();

// Rango de la norma tal como lo publica el conjunto (catalán) -> tipo de norma en castellano.
const TYPE_BY_RANG: ReadonlyMap<string, NormType> = new Map<string, NormType>([
  ["llei", "Ley"],
  ["decret llei", "Decreto-ley"],
  ["decret", "Decreto"],
  ["decret legislatiu", "Decreto Legislativo"],
  ["ordre", "Orden"],
]);

function dogcNormType(rang: unknown, title: string): NormType {
  return (typeof rang === "string" ? TYPE_BY_RANG.get(fold(rang)) : undefined) ?? normTypeOf(title);
}

// Enlace {url} del Portal Jurídic: solo https, host exacto, sin puerto ni credenciales, sin espacios ni caracteres de control.
function linkUrl(field: unknown): { state: "absent" } | { state: "bad" } | { state: "ok"; url: string } {
  if (field === undefined || field === null) return { state: "absent" };
  if (!isObj(field)) return { state: "bad" };
  const v = field["url"];
  if (typeof v !== "string" || v.length > MAX_TEXT || /[\s\p{Cc}\p{Cf}\\]/u.test(v)) return { state: "bad" };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { state: "bad" };
  }
  if (u.protocol !== "https:" || u.hostname !== DOGC_LINK_HOST || u.port !== "" || u.username !== "" || u.password !== "") return { state: "bad" };
  return { state: "ok", url: u.href };
}

// Primero el campo en castellano y, si falta o no vale, el catalán.
const LINKS = {
  urlHtml: ["url_es_formato_html", "format_html"],
  urlPdf: ["url_es_formato_pdf", "format_pdf"],
  urlXml: ["url_es_format_xml", "url_format_xml"],
} as const;

export function parseDogc(body: unknown, date: string, retrievedAt: string): { items: OutputItem[]; dropped: Dropped } {
  if (!isObj(body) || !Array.isArray(body["rows"])) throw new BoeError("documento del DOGC inesperado");
  const updatedRaw = body["sourceUpdated"];
  const sourceUpdated = typeof updatedRaw === "string" && ISO_DAY.test(updatedRaw) && validDate(updatedRaw) ? updatedRaw : undefined;
  const dropped: Dropped = { badId: 0, badUrl: 0, nameGuard: 0, tooLong: 0, otherSection: 0 };
  const items: OutputItem[] = [];
  for (const entry of body["rows"] as unknown[]) {
    if (!isObj(entry)) {
      dropped.badId++;
      continue;
    }
    const control = entry["n_mero_de_control"];
    const published = typeof entry["data_de_publicaci_del_diari"] === "string" ? PUBLISHED_FORMAT.exec(entry["data_de_publicaci_del_diari"]) : null;
    if (typeof control !== "string" || !ID_FORMAT.test(control) || published === null || published[1] !== date) {
      dropped.badId++;
      continue;
    }
    // Título en castellano; si falta, el catalán. Se comprueba el texto tal cual llega.
    const es = entry["t_tol_de_la_norma_es"];
    const rawTitle = typeof es === "string" && es.trim() !== "" ? es : entry["t_tol_de_la_norma"];
    if (typeof rawTitle !== "string" || text(rawTitle).trim() === "") {
      dropped.badId++;
      continue;
    }
    const title = text(rawTitle);
    // Sobre el texto tal cual y sobre el ya sin caracteres de control («D\u0000on» se guarda como «Don»).
    if (nameGuardHit(rawTitle) || nameGuardHit(title)) {
      dropped.nameGuard++;
      continue;
    }
    // Un título que una hoja de cálculo leería como fórmula no se edita: se descarta.
    if (/^[=+\-@\t\r]/.test(title)) {
      dropped.badId++;
      continue;
    }
    if (title.length > MAX_TEXT) {
      dropped.tooLong++;
      continue;
    }
    const urls: { urlHtml?: string; urlPdf?: string; urlXml?: string } = {};
    for (const key of ["urlHtml", "urlPdf", "urlXml"] as const) {
      for (const field of LINKS[key]) {
        const link = linkUrl(entry[field]);
        if (link.state === "absent") continue;
        if (link.state === "bad") {
          dropped.badUrl++;
          continue;
        }
        urls[key] = link.url;
        break;
      }
    }
    items.push({
      id: `DOGC-${control}`,
      date,
      section: "1",
      // El conjunto de datos no publica departamento.
      department: "",
      epigraph: "",
      title,
      ...urls,
      retrievedAt,
      source: DOGC_SOURCE_LINE,
      sourceUrl: DOGC_SOURCE_URL,
      ...(sourceUpdated !== undefined ? { sourceUpdated } : {}),
      normType: dogcNormType(entry["rang_de_norma"], title),
      bulletin: "DOGC",
    });
  }
  return { items, dropped };
}

export const dogc: SourceAdapter = {
  id: "DOGC",
  fetchDay: (date, options) => fetchDogcDay(date, options),
  parseDay: (body, date, retrievedAt) => parseDogc(body, date, retrievedAt),
};
