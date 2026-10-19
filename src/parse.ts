// Analizador del sumario del BOE. Solo biblioteca estándar.
// Conserva únicamente metadatos y enlaces de la sección I; nunca texto íntegro ni nombres de firmantes.
import { BoeError } from "./errors.ts";

export const SOURCE_LINE = "Fuente de los datos: Agencia Estatal Boletín Oficial del Estado";
export const SOURCE_URL = "https://www.boe.es";

const MAX_TEXT = 2000;
const BOE_HOST = "www.boe.es";

// Tratamientos personales ("don", "doña", "D.", "Dña.") seguidos de espacio. No se usa \b porque
// no reconoce bien las letras acentuadas ni la ñ.
const NAME_GUARD = /(?<![\p{L}])(?:don|doña|D\.|Dña\.)(?=\s)/iu;

export type OutputItem = {
  id: string;
  date: string;
  section: "1";
  department: string;
  epigraph: string;
  title: string;
  urlHtml?: string;
  urlPdf?: string;
  urlXml?: string;
  retrievedAt: string;
  source: string;
  sourceUrl: string;
};

// Recuentos de lo descartado: identificador no válido, enlace que no es del BOE y filtro de nombres.
export type Dropped = { badId: number; badUrl: number; nameGuard: number };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// La API devuelve un objeto cuando hay una sola entrada y una lista cuando hay varias.
function many(v: unknown): Obj[] {
  if (Array.isArray(v)) return v.filter(isObj);
  return isObj(v) ? [v] : [];
}

function text(v: unknown): string {
  return typeof v === "string" ? v.slice(0, MAX_TEXT) : "";
}

// Devuelve el enlace normalizado si es https del BOE; null si no lo es.
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

// Un enlace ausente no cuenta como descartado; uno presente pero ajeno al BOE sí.
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
  if (dropped.nameGuard > 0) {
    out.push(
      dropped.nameGuard === 1
        ? "descartado 1 elemento por el filtro de nombres"
        : `descartados ${dropped.nameGuard} elementos por el filtro de nombres`,
    );
  }
  return out;
}

export function parseSumario(json: unknown, date: string, retrievedAt: string): { items: OutputItem[]; dropped: Dropped } {
  if (!isObj(json) || !isObj(json["data"]) || !isObj(json["data"]["sumario"])) {
    throw new BoeError("documento de sumario inesperado");
  }
  const diarios = json["data"]["sumario"]["diario"];
  if (!Array.isArray(diarios)) throw new BoeError("documento de sumario inesperado: falta diario");
  const items: OutputItem[] = [];
  const dropped: Dropped = { badId: 0, badUrl: 0, nameGuard: 0 };
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
            const rawTitle = entry["titulo"];
            if (typeof rawTitle === "string" && NAME_GUARD.test(rawTitle)) {
              dropped.nameGuard++;
              continue;
            }
            const pdf = isObj(entry["url_pdf"]) ? entry["url_pdf"]["texto"] : undefined;
            const urlHtml = checkedUrl(entry["url_html"], dropped);
            const urlPdf = checkedUrl(pdf, dropped);
            const urlXml = checkedUrl(entry["url_xml"], dropped);
            items.push({
              id,
              date,
              section: "1",
              department: text(dep["nombre"]),
              epigraph: group.epigraph,
              title: text(rawTitle),
              ...(urlHtml !== undefined ? { urlHtml } : {}),
              ...(urlPdf !== undefined ? { urlPdf } : {}),
              ...(urlXml !== undefined ? { urlXml } : {}),
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
