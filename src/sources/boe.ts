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
import { stageOf } from "../oposiciones.ts";
import { isAllowedEpigraph, personGuardHit, personSubsetHit } from "../section3.ts";
import type { SourceAdapter } from "./types.ts";

type Obj = Record<string, unknown>;

// «Ayuntamiento de <nombre>» hasta el primer «(» o «,» (solo si alguno de los dos sigue al nombre).
const MUNICIPALITY = /ayuntamiento de ([^(,]*)(?=[(,])/giu;
// Un nombre de lugar: 1-60 caracteres, solo letras, espacios, apóstrofos, guiones y puntos.
const PLACE_CHARS = /^[\p{L}\p{M} '’.\-]{1,60}$/u;
// Palabras de una cláusula («por la que se nombra a…»): si aparecen, el segmento no es un nombre de lugar.
const CLAUSE_WORD = /(?<!\p{L})(?:por|que|se|nombra|nombran|nombrado|convoca|convocan|para|a|al|la que|el que)(?!\p{L})/u;

// Una palabra que contiene un tratamiento según el mismo filtro (sin distinguir mayúsculas, tildes ni ancho).
const hasHonorific = (word: string): boolean => nameGuardHit(word + " ");
// La palabra es entera un tratamiento («Don», «Doña», «D.ª», «ｄｏｎ»…): empieza por letra y, con una letra delante,
// el filtro ya no salta (si saltara, el tratamiento empezaría dentro de la palabra, como en «L'Don»).
const isHonorific = (word: string): boolean => /^\p{L}/u.test(word) && hasHonorific(word) && !hasHonorific("a" + word);
// Palabra de un nombre de lugar tras el tratamiento: empieza por mayúscula.
const CAPITALISED = /^\p{Lu}/u;

// Verdadero si el segmento tras «Ayuntamiento de» parece el nombre de un municipio («Puebla de Don Fadrique»).
// Ante la duda, no: entonces el filtro de tratamientos mira el título entero. Solo se admite un tratamiento, escrito
// con mayúscula, justo detrás de «de» o «del» y seguido hasta el final del segmento de una o más palabras con
// mayúscula sin otro tratamiento («… de Don Fadrique», «… de Doña Mencía», «Valencia de Don Juan»). Un tratamiento
// al principio del segmento o detrás de otra palabra («Valencia don Juan Pérez») hace que no lo parezca.
// Límites aceptados: un municipio cuyo nombre empiece por «Don» o «Doña» se descarta igualmente, y una persona
// escrita como «Ayuntamiento de X de Don Nombre Apellido (» no se distingue de un municipio como «Valencia de Don Juan».
function placeLike(segment: string): boolean {
  const s = segment.normalize("NFC").trim();
  if (!PLACE_CHARS.test(s)) return false;
  const folded = s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (CLAUSE_WORD.test(folded)) return false;
  const words = s.split(/\s+/);
  const marked = words.flatMap((w, i) => (hasHonorific(w) ? [i] : []));
  if (marked.length === 0) return true;
  if (marked.length > 1) return false;
  const at = marked[0]!;
  const before = words[at - 1];
  const after = words.slice(at + 1);
  return (
    isHonorific(words[at]!) &&
    CAPITALISED.test(words[at]!) &&
    (before === "de" || before === "del") &&
    after.length > 0 &&
    after.every((w) => CAPITALISED.test(w))
  );
}

// Solo II-B: neutraliza el tratamiento que forma parte del nombre de un municipio; el resto del título no cambia.
function withoutMunicipality(title: string): string {
  return title.replace(MUNICIPALITY, (whole: string, segment: string) => (placeLike(segment) ? " " : whole));
}

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

// sections: secciones que se leen; por defecto solo la I. La III y la II-B (oposiciones) exigen activarse expresamente.
// includeProcessUpdates: en la II-B, entregar también las actualizaciones y los elementos sin fase reconocida;
// por defecto solo las convocatorias. La sección II-A nunca se lee.
export function parseSumario(
  json: unknown,
  date: string,
  retrievedAt: string,
  sections: readonly string[] = ["1"],
  includeProcessUpdates: boolean = false,
): { items: OutputItem[]; dropped: Dropped } {
  if (!isObj(json) || !isObj(json["data"]) || !isObj(json["data"]["sumario"])) {
    throw new BoeError("documento de sumario inesperado");
  }
  const diarios = json["data"]["sumario"]["diario"];
  if (!Array.isArray(diarios)) throw new BoeError("documento de sumario inesperado: falta diario");
  const items: OutputItem[] = [];
  const withThree = sections.includes("3");
  const withOpos = sections.includes("2B");
  const dropped: Dropped = {
    badId: 0,
    badUrl: 0,
    nameGuard: 0,
    tooLong: 0,
    ...(withThree ? { notAllowed: 0 } : {}),
    ...(withThree || withOpos ? { personGuard: 0 } : {}),
    ...(withOpos ? { updatesOmitted: 0, othersOmitted: 0 } : {}),
  };
  for (const diario of many(diarios)) {
    for (const seccion of many(diario["seccion"])) {
      const code = seccion["codigo"];
      if (code !== "1" && code !== "2B" && code !== "3") continue;
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
            // En la II-B el nombre de un municipio («Ayuntamiento de Puebla de Don Fadrique (Granada)») no es un tratamiento.
            const guarded = typeof rawTitle === "string" && code === "2B" ? withoutMunicipality(rawTitle) : rawTitle;
            // También sobre el título ya sin caracteres de control («D\u0000on» se guarda como «Don»).
            const cleanedTitle = text(rawTitle);
            const guardedClean = code === "2B" ? withoutMunicipality(cleanedTitle) : cleanedTitle;
            if ((typeof guarded === "string" && nameGuardHit(guarded)) || (typeof rawTitle === "string" && nameGuardHit(guardedClean))) {
              dropped.nameGuard++;
              continue;
            }
            if (typeof rawTitle === "string" && (code === "3" ? personGuardHit(rawTitle) : code === "2B" && personSubsetHit(rawTitle))) {
              dropped.personGuard = (dropped.personGuard ?? 0) + 1;
              continue;
            }
            const department = text(dep["nombre"]);
            const title = text(rawTitle);
            if (department.length > MAX_TEXT || group.epigraph.length > MAX_TEXT || title.length > MAX_TEXT) {
              dropped.tooLong++;
              continue;
            }
            // Sección II-B: la fase sale del título; por defecto solo se entregan las convocatorias.
            const stage = code === "2B" ? stageOf(title) : undefined;
            if (stage === "actualizacion" && !includeProcessUpdates) {
              dropped.updatesOmitted = (dropped.updatesOmitted ?? 0) + 1;
              continue;
            }
            if (stage === "otro" && !includeProcessUpdates) {
              dropped.othersOmitted = (dropped.othersOmitted ?? 0) + 1;
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
              ...(stage !== undefined ? { stage } : {}),
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
  parseDay: (json, date, retrievedAt, sections, includeProcessUpdates) =>
    parseSumario(json, date, retrievedAt, sections ?? ["1"], includeProcessUpdates === true),
};
