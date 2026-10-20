// Fuente BOJA (Junta de Andalucía): API de datos abiertos, JSON, licencia CC BY 4.0. Una consulta por fecha a
// get/search_pagination con la lista de campos cerrada: nunca se piden body, bodyNoHtml ni resúmenes con HTML.
// Solo se conservan los elementos de «1. Disposiciones generales».
import { BoeError } from "../errors.ts";
import { normTypeOf } from "../classify.ts";
import type { NormType } from "../classify.ts";
import { validDate } from "../dates.ts";
import { fetchDocument } from "../http.ts";
import type { DocumentSpec, FetchOptions, FetchResult } from "../http.ts";
import { MAX_TEXT, isObj, many, nameGuardHit, text } from "../parse.ts";
import type { Dropped, OutputItem } from "../parse.ts";
import type { SourceAdapter } from "./types.ts";

export const BOJA_HOST = "datos.juntadeandalucia.es";
export const BOJA_SOURCE_LINE = "Fuente: Junta de Andalucía, BOJA (CC BY 4.0)";
export const BOJA_SOURCE_URL = "https://www.juntadeandalucia.es/boja";
const BOJA_PATH = "/api/v0/boja/get/search_pagination";
const PAGE_SIZE = 200;
const MAX_PAGES = 5;
// Campos que se piden: ninguno lleva texto íntegro ni HTML.
const CAMPOS = ["id", "date", "titleSec", "type", "organisation", "summaryNoHtml", "pathPdf", "publicUrl"] as const;
const ID_FORMAT = /^disposition\.[0-9]{4}\.[0-9]+\.[0-9]+$/;
const GENERAL_SECTION = "1. disposiciones generales";
const PDF_HOSTS: readonly string[] = ["juntadeandalucia.es", "www.juntadeandalucia.es"];

export function buildBojaUrl(isoDate: string, page: number): string {
  if (typeof isoDate !== "string" || !validDate(isoDate)) throw new BoeError("fecha no válida");
  if (!Number.isInteger(page) || page < 0 || page >= MAX_PAGES) throw new BoeError("página no válida");
  const u = new URL(`https://${BOJA_HOST}${BOJA_PATH}`);
  u.searchParams.set("order_by", "id");
  u.searchParams.set("mode", "ASC");
  u.searchParams.set("size", String(PAGE_SIZE));
  u.searchParams.set("page", String(page));
  u.searchParams.set("date_from", isoDate);
  u.searchParams.set("date_to", isoDate);
  for (const campo of CAMPOS) u.searchParams.append("campos", campo);
  return u.href;
}

// Un día sin boletín responde 400 con este cuerpo exacto; cualquier otro 400 es un fallo.
const EMPTY_BODY = (t: string): boolean => {
  try {
    const j: unknown = JSON.parse(t);
    return isObj(j) && j["status"] === 400 && j["message"] === "Bad request" && Object.keys(j).length === 2;
  } catch {
    return false;
  }
};
const SPEC: DocumentSpec = { label: "BOJA", accept: "application/json", contentType: "application/json", parse: "json", emptyStatus: 400, emptyBody: EMPTY_BODY };

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchBojaDay(isoDate: string, options: FetchOptions = {}): Promise<FetchResult> {
  const sleep = options.sleep ?? defaultSleep;
  const results: unknown[] = [];
  let requests = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(options.requestDelayMs ?? 1000);
    const res = await fetchDocument(buildBojaUrl(isoDate, page), isoDate, SPEC, options);
    requests += res.requests;
    if (res.status === "empty") return page === 0 ? { status: "empty", requests } : { status: "ok", body: { results }, requests };
    const doc = res.body;
    if (!isObj(doc) || !Array.isArray(doc["results"])) throw new BoeError("documento del BOJA inesperado");
    const batch = doc["results"] as unknown[];
    results.push(...batch);
    const total = typeof doc["total_hits"] === "number" ? doc["total_hits"] : results.length;
    if (batch.length < PAGE_SIZE || results.length >= total) return { status: "ok", body: { results }, requests };
  }
  throw new BoeError(`el BOJA devolvió más de ${PAGE_SIZE * MAX_PAGES} elementos para el ${isoDate}`);
}

const fold = (v: string): string => v.normalize("NFC").trim().toLowerCase();

// Tipo de norma del campo type del BOJA (plural, con variantes), para los títulos que no empiezan por el tipo.
const TYPE_BY_FIELD: Record<string, NormType> = {
  decreto: "Decreto",
  decretos: "Decreto",
  "decretos legislativos": "Decreto Legislativo",
  "decretos leyes": "Decreto-ley",
  "decretos-leyes": "Decreto-ley",
  ley: "Ley",
  leyes: "Ley",
  orden: "Orden",
  ordenes: "Orden",
  órdenes: "Orden",
  resolución: "Resolución",
  resoluciones: "Resolución",
  circular: "Circular",
  circulares: "Circular",
  "real decreto": "Real Decreto",
  "reales decretos": "Real Decreto",
  "real decreto ley": "Real Decreto-ley",
};

function bojaNormType(title: string, department: string, type: string): NormType {
  const derived = normTypeOf(title, department);
  if (derived !== "Otro") return derived;
  return TYPE_BY_FIELD[fold(type)] ?? "Otro";
}

function pdfUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > MAX_TEXT) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !PDF_HOSTS.includes(u.hostname) || u.port !== "" || u.username !== "" || u.password !== "") return null;
  return u.href;
}

export function parseBoja(json: unknown, date: string, retrievedAt: string): { items: OutputItem[]; dropped: Dropped } {
  if (!isObj(json) || !Array.isArray(json["results"])) throw new BoeError("documento del BOJA inesperado");
  const dropped: Dropped = { badId: 0, badUrl: 0, nameGuard: 0, tooLong: 0, otherSection: 0 };
  const items: OutputItem[] = [];
  for (const entry of many(json["results"])) {
    const section = text(entry["titleSec"]).trim();
    if (fold(section) !== GENERAL_SECTION) {
      dropped.otherSection = (dropped.otherSection ?? 0) + 1;
      continue;
    }
    const id = entry["id"];
    if (typeof id !== "string" || !ID_FORMAT.test(id)) {
      dropped.badId++;
      continue;
    }
    const rawTitle = entry["summaryNoHtml"];
    if (typeof rawTitle === "string" && nameGuardHit(rawTitle)) {
      dropped.nameGuard++;
      continue;
    }
    const department = text(entry["organisation"]);
    const title = text(rawTitle);
    if (department.length > MAX_TEXT || title.length > MAX_TEXT) {
      dropped.tooLong++;
      continue;
    }
    const first = many(entry["pdf"])[0];
    let urlPdf: string | undefined;
    if (first !== undefined && first["publicUrl"] !== undefined && first["publicUrl"] !== null) {
      const checked = pdfUrl(first["publicUrl"]);
      if (checked === null) dropped.badUrl++;
      else urlPdf = checked;
    }
    items.push({
      id,
      date,
      section,
      department,
      epigraph: "",
      title,
      ...(urlPdf !== undefined ? { urlPdf } : {}),
      retrievedAt,
      source: BOJA_SOURCE_LINE,
      sourceUrl: BOJA_SOURCE_URL,
      normType: bojaNormType(title, department, text(entry["type"])),
      bulletin: "BOJA",
    });
  }
  return { items, dropped };
}

export const boja: SourceAdapter = {
  id: "BOJA",
  fetchDay: (date, options) => fetchBojaDay(date, options),
  parseDay: (body, date, retrievedAt) => parseBoja(body, date, retrievedAt),
};
