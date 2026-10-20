// Analizador del sumario del BOE. Solo biblioteca estándar.
// Conserva únicamente metadatos y enlaces de la sección I y, si se pide, de la sección III con los
// filtros de section3.ts; nunca texto íntegro ni nombres de firmantes.
import { BoeError } from "./errors.ts";
import { normTypeOf } from "./classify.ts";
import type { NormType } from "./classify.ts";
import { isAllowedEpigraph, personGuardHit } from "./section3.ts";

export const SOURCE_LINE = "Fuente de los datos: Agencia Estatal Boletín Oficial del Estado";
export const SOURCE_URL = "https://www.boe.es";

const MAX_TEXT = 2000;
const BOE_HOST = "www.boe.es";

// Tratamientos personales ("don", "doña", "D.", "D.ª", "Dª", "Dña" con o sin punto) seguidos de espacio.
// No se usa \b porque no reconoce bien las letras acentuadas ni la ñ. La mirada atrás excluye letras y
// puntos, de modo que abreviaturas como "R.D. 123/2026" no se confunden con un tratamiento; los casos
// ambiguos se descartan igualmente, porque ante la duda prima la protección de datos personales.
const NAME_GUARD = /(?<![\p{L}.])(?:don|doña|d\.ª|dª|dña\.?|d\.)(?=\s)/iu;
// Caracteres de formato invisibles (categoría Cf): guion blando U+00AD, marcas de dirección, controles
// bidireccionales, ancho cero, U+2060-2064 y la marca de orden de bytes.
const INVISIBLE = /\p{Cf}/gu;

// Texto que se somete al filtro: normalizado a NFC y sin caracteres invisibles. Solo sirve para la
// comprobación; el título que se guarda no se modifica.
function guardText(v: string): string {
  return v.normalize("NFC").replace(INVISIBLE, "");
}

export type OutputItem = {
  id: string;
  date: string;
  // "3" solo aparece si el usuario activa la sección III.
  section: "1" | "3";
  department: string;
  epigraph: string;
  title: string;
  urlHtml?: string;
  urlPdf?: string;
  urlXml?: string;
  retrievedAt: string;
  source: string;
  sourceUrl: string;
  // Campo derivado por este Actor a partir del título; no es un metadato del BOE.
  normType: NormType;
};

// Recuentos de lo descartado: identificador no válido, enlace no válido, filtro de nombres y texto demasiado largo.
// Con la sección III activada se añaden los epígrafes fuera del listado y el filtro de adjudicaciones y personas;
// sin ella esas dos claves no existen, de modo que la salida es la de 1.3.
export type Dropped = {
  badId: number;
  badUrl: number;
  nameGuard: number;
  tooLong: number;
  notAllowed?: number;
  personGuard?: number;
};

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// La API devuelve un objeto cuando hay una sola entrada y una lista cuando hay varias.
function many(v: unknown): Obj[] {
  if (Array.isArray(v)) return v.filter(isObj);
  return isObj(v) ? [v] : [];
}

// Los textos no se truncan, porque alteraría los metadatos del BOE: uno demasiado largo descarta el elemento.
function text(v: unknown): string {
  return typeof v === "string" ? v : "";
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

// Líneas de registro para lo descartado: solo recuentos, nunca contenido.
export function dropMessages(dropped: Dropped): string[] {
  const out: string[] = [];
  if (dropped.badId > 0) {
    out.push(
      dropped.badId === 1
        ? "descartado 1 elemento con identificador no válido"
        : `descartados ${dropped.badId} elementos con identificador no válido`,
    );
  }
  if (dropped.badUrl > 0) {
    out.push(
      dropped.badUrl === 1
        ? "descartado 1 enlace que no es del BOE"
        : `descartados ${dropped.badUrl} enlaces que no son del BOE`,
    );
  }
  if (dropped.tooLong > 0) {
    out.push(
      dropped.tooLong === 1
        ? "descartado 1 elemento con texto demasiado largo"
        : `descartados ${dropped.tooLong} elementos con texto demasiado largo`,
    );
  }
  if (dropped.nameGuard > 0) {
    out.push(
      dropped.nameGuard === 1
        ? "descartado 1 elemento por el filtro de nombres"
        : `descartados ${dropped.nameGuard} elementos por el filtro de nombres`,
    );
  }
  const notAllowed = dropped.notAllowed ?? 0;
  if (notAllowed > 0) {
    out.push(
      notAllowed === 1
        ? "descartado 1 elemento fuera del listado de epígrafes de la sección III"
        : `descartados ${notAllowed} elementos fuera del listado de epígrafes de la sección III`,
    );
  }
  const personGuard = dropped.personGuard ?? 0;
  if (personGuard > 0) {
    out.push(
      personGuard === 1
        ? "descartado 1 elemento por el filtro de adjudicaciones y personas de la sección III"
        : `descartados ${personGuard} elementos por el filtro de adjudicaciones y personas de la sección III`,
    );
  }
  return out;
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
            if (typeof rawTitle === "string" && NAME_GUARD.test(guardText(rawTitle))) {
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
            });
          }
        }
      }
    }
  }
  return { items, dropped };
}
