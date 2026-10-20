// Fuente BOE (datos abiertos, API de sumarios). Es el código de la 1.4.0 movido aquí sin cambiar su comportamiento:
// URL, petición y analizador del sumario. Conserva únicamente metadatos y enlaces de la sección I y, si se pide, de
// la sección III con los filtros de section3.ts; nunca texto íntegro ni nombres de firmantes.
import { BoeError } from "../errors.ts";
import { normTypeOf } from "../classify.ts";
import { fetchDocument } from "../http.ts";
import type { DocumentSpec, FetchOptions, FetchResult } from "../http.ts";
import { validDate } from "../input.ts";
import { MAX_TEXT, isObj, many, nameGuardHit, text } from "../parse.ts";
import type { Dropped, OutputItem } from "../parse.ts";
import { isAllowedEpigraph, personGuardHit } from "../section3.ts";
import type { SourceAdapter } from "./types.ts";

type Obj = Record<string, unknown>;

export const SOURCE_LINE = "Fuente de los datos: Agencia Estatal Boletín Oficial del Estado";
export const SOURCE_URL = "https://www.boe.es";

export const BASE_URL = "https://www.boe.es/datosabiertos/api/boe/sumario/";
const BOE_HOST = "www.boe.es";

export function buildSumarioUrl(isoDate: string): string {
  if (typeof isoDate !== "string" || !validDate(isoDate)) throw new BoeError("fecha no válida");
  return BASE_URL + isoDate.replaceAll("-", "");
}

const BOE_SPEC: DocumentSpec = { label: "BOE", accept: "application/json", contentType: "application/json", parse: "json", emptyStatus: 404 };

export async function fetchSumario(isoDate: string, options: FetchOptions = {}): Promise<FetchResult> {
  return fetchDocument(buildSumarioUrl(isoDate), isoDate, BOE_SPEC, options);
}

// Devuelve el enlace normalizado si es https del BOE; null si no lo es.
function boeUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > MAX_TEXT) return null;
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

// Un enlace ausente no cuenta como descartado; uno presente pero ajeno al BOE o con forma inesperada sí.
function checkedUrl(v: unknown, dropped: Dropped): string | undefined {
  if (v === undefined || v === null) return undefined;
  const url = boeUrl(v);
  if (url === null) {
    dropped.badUrl++;
    return undefined;
  }
  return url;
}

// sections: secciones que se leen; por defecto solo la I. La III exige activarla expresamente.
export function parseSumario(
  json: unknown,
  date: string,
  retrievedAt: string,
  sections: readonly string[] = ["1"],
): { items: OutputItem[]; dropped: Dropped } {
  if (!isObj(json) || !isObj(json["data"]) || !isObj(json["data"]["sumario"])) {
    throw new BoeError("documento de sumario inesperado");
  }
  const diarios = json["data"]["sumario"]["diario"];
  if (!Array.isArray(diarios)) throw new BoeError("documento de sumario inesperado: falta diario");
  const items: OutputItem[] = [];
  const withThree = sections.includes("3");
  const dropped: Dropped = { badId: 0, badUrl: 0, nameGuard: 0, tooLong: 0, ...(withThree ? { notAllowed: 0, personGuard: 0 } : {}) };
  for (const diario of many(diarios)) {
    for (const seccion of many(diario["seccion"])) {
      const code = seccion["codigo"];
      if (code !== "1" && code !== "3") continue;
      if (!sections.includes(code)) continue;
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
            // Sección III: solo los epígrafes del listado (el resto se descarta sin mirar el título).
            if (code === "3" && !isAllowedEpigraph(group.epigraph)) {
              dropped.notAllowed = (dropped.notAllowed ?? 0) + 1;
              continue;
            }
            const rawTitle = entry["titulo"];
            if (typeof rawTitle === "string" && nameGuardHit(rawTitle)) {
              dropped.nameGuard++;
              continue;
            }
            if (code === "3" && typeof rawTitle === "string" && personGuardHit(rawTitle)) {
              dropped.personGuard = (dropped.personGuard ?? 0) + 1;
              continue;
            }
            const department = text(dep["nombre"]);
            const title = text(rawTitle);
            if (department.length > MAX_TEXT || group.epigraph.length > MAX_TEXT || title.length > MAX_TEXT) {
              dropped.tooLong++;
              continue;
            }
            // url_pdf es un objeto con el enlace en "texto"; presente con otra forma cuenta como no válido.
            const rawPdf = entry["url_pdf"];
            if (rawPdf !== undefined && rawPdf !== null && !isObj(rawPdf)) dropped.badUrl++;
            const pdf = isObj(rawPdf) ? rawPdf["texto"] : undefined;
            const urlHtml = checkedUrl(entry["url_html"], dropped);
            const urlPdf = checkedUrl(pdf, dropped);
            const urlXml = checkedUrl(entry["url_xml"], dropped);
            items.push({
              id,
              date,
              section: code,
              department,
              epigraph: group.epigraph,
              title,
              ...(urlHtml !== undefined ? { urlHtml } : {}),
              ...(urlPdf !== undefined ? { urlPdf } : {}),
              ...(urlXml !== undefined ? { urlXml } : {}),
              retrievedAt,
              source: SOURCE_LINE,
              sourceUrl: SOURCE_URL,
              normType: normTypeOf(title, department),
              bulletin: "BOE",
            });
          }
        }
      }
    }
  }
  return { items, dropped };
}

export const boe: SourceAdapter = {
  id: "BOE",
  fetchDay: (date, options) => fetchSumario(date, options),
  parseDay: (json, date, retrievedAt, sections) => parseSumario(json, date, retrievedAt, sections ?? ["1"]),
};
