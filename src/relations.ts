// Opción relations (1.6): qué normas cambia cada disposición de la sección I del BOE. Para cada elemento se pide su
// documento XML y se lee únicamente analisis/referencias/anteriores; el resto del documento (incluido el texto
// íntegro) se ignora. Solo biblioteca estándar. Reglas de seguridad:
//  - la URL se construye solo con el identificador ya validado del elemento y un servidor constante; nunca se
//    usa una dirección que venga en una respuesta;
//  - se reutiliza el cliente de http.ts (User-Agent, sin redirecciones, tiempo y tamaño máximos, reintentos);
//  - el análisis se corta del documento y se lee con el lector XML endurecido de xml.ts (sin DOCTYPE ni entidades,
//    con topes de tamaño, profundidad y nodos);
//  - un fallo de un elemento nunca hace fallar la ejecución.
import { BoeError } from "./errors.ts";
import { fetchDocument } from "./http.ts";
import type { DocumentSpec, FetchOptions } from "./http.ts";
import { cleanText, nameGuardHit } from "./parse.ts";
import type { Change, ChangesStatus } from "./parse.ts";
import { personGuardHit } from "./section3.ts";
import { childrenNamed, parseXml } from "./xml.ts";
import type { XmlNode } from "./xml.ts";

// Tope duro de documentos pedidos por ejecución. Con 2-11 elementos de la sección I al día, 1000 cubre con holgura
// un rango de 366 días; con un rango muy amplio y followIds, el resto de elementos queda como «skipped».
export const MAX_RELATION_REQUESTS = 1000;
// Tras tantos fallos seguidos no se piden más documentos en la ejecución (el BOE no responde o limita): el resto
// queda como «skipped». Cada fallo ya ha agotado sus reintentos.
export const MAX_CONSECUTIVE_RELATION_ERRORS = 5;
// Tope de peticiones HTTP (todos los intentos, también los reintentos) para relaciones en una ejecución: los fallos
// alternados con aciertos no activan el corte de fallos seguidos, así que este tope es la defensa final.
export const MAX_RELATION_HTTP_ATTEMPTS = 1500;
// Tras tantos documentos fallidos en total (no solo seguidos) no se piden más en la ejecución.
export const MAX_TOTAL_RELATION_ERRORS = 50;
export const MAX_DETAIL_CHARS = 300;
export const MAX_ACTION_CHARS = 40;
// Relaciones que se leen como máximo de un documento.
export const MAX_CHANGES_PER_ITEM = 200;

export const DOCUMENT_BASE_URL = "https://www.boe.es/diario_boe/xml.php?id=";
export const CONSOLIDATED_BASE_URL = "https://www.boe.es/buscar/act.php?id=";

export const DOCUMENT_ID = /^BOE-A-\d{4}-\d{1,7}$/;
const TARGET_ID = /^[A-Z]{2,8}-[A-Za-z]-\d{4}-\d{1,7}$/;
const BOE_TARGET_ID = /^BOE-A-\d{4}-\d{1,7}$/;

// Relaciones débiles que no se incluyen: 330 CITA, 331 EN RELACIÓN con, 440 DE CONFORMIDAD con.
const WEAK_CODES: ReadonlySet<number> = new Set([330, 331, 440]);

// Palabra en castellano para los códigos conocidos (la redacción oficial de la tabla de relaciones, en minúsculas).
const ACTIONS: ReadonlyMap<number, string> = new Map([
  [201, "corrige"],
  [202, "corrige"],
  [203, "corrige"],
  [204, "corrige"],
  [210, "deroga"],
  [211, "deroga"],
  [212, "deroga"],
  [213, "deroga"],
  [214, "deroga"],
  [215, "deroga"],
  [216, "deroga"],
  [217, "deroga"],
  [220, "anula"],
  [221, "anula"],
  [230, "deja sin efecto"],
  [231, "suspende"],
  [235, "suprime"],
  [245, "sustituye"],
  [270, "modifica"],
  [271, "modifica"],
  [272, "modifica"],
  [300, "publica"],
  [404, "actualiza"],
  [406, "amplía"],
  [407, "añade"],
  [408, "completa"],
  [420, "aprueba"],
  [421, "autoriza"],
  [426, "transpone"],
  [427, "transpone"],
  [490, "desarrolla"],
]);

// Código desconocido: el texto oficial de la palabra, en minúsculas y solo con letras y espacios, de hasta 40 caracteres.
function sanitizeAction(raw: string): string {
  const letters = raw
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L} ]+/gu, " ")
    .replace(/ +/g, " ")
    .trim();
  const cut = [...letters].slice(0, MAX_ACTION_CHARS).join("").trim();
  return cut === "" ? "se relaciona con" : cut;
}

export function actionFor(code: number, wording: string): string {
  return ACTIONS.get(code) ?? sanitizeAction(wording);
}

function cleanDetail(raw: string): string | undefined {
  // Sin caracteres de formato invisibles (ancho cero, guion blando, unión de palabras…).
  const pre = cleanText(raw).replace(/\p{Cf}/gu, "");
  const t = pre.replace(/\s+/g, " ").trim();
  if (t === "") return undefined;
  // Se descarta lo que una hoja de cálculo tomaría por fórmula (= + - @, tabulador, retorno) o un navegador por marcas (< >).
  if (/^[=+\-@\t\r]/.test(pre) || /^[=+\-@]/.test(t) || /[<>]/.test(t)) return undefined;
  // El mismo filtro de tratamientos personales de los títulos y el de personas de la sección III, sobre el texto íntegro.
  if (nameGuardHit(t) || personGuardHit(t)) return undefined;
  const chars = [...t];
  return chars.length > MAX_DETAIL_CHARS ? `${chars.slice(0, MAX_DETAIL_CHARS - 1).join("")}…` : t;
}

function readChange(node: XmlNode): Change | undefined {
  const targetId = (node.attrs?.["referencia"] ?? "").trim();
  if (!TARGET_ID.test(targetId)) return undefined;
  const word = childrenNamed(node, "palabra")[0];
  const codeText = (word?.attrs?.["codigo"] ?? "").trim();
  if (word === undefined || !/^\d{1,4}$/.test(codeText)) return undefined;
  const code = Number(codeText);
  if (WEAK_CODES.has(code)) return undefined;
  const detail = cleanDetail(childrenNamed(node, "texto")[0]?.text ?? "");
  return {
    action: actionFor(code, word.text),
    code,
    targetId,
    ...(BOE_TARGET_ID.test(targetId) ? { targetUrl: CONSOLIDATED_BASE_URL + targetId } : {}),
    ...(detail !== undefined ? { detail } : {}),
  };
}

// Posición de la etiqueta de apertura <name (seguida de espacio, > o /); -1 si no está.
function openTag(xml: string, name: string, from = 0): number {
  const needle = `<${name}`;
  for (let at = xml.indexOf(needle, from); at !== -1; at = xml.indexOf(needle, at + needle.length)) {
    const next = xml[at + needle.length];
    if (next === ">" || next === "/" || next === " " || next === "\n" || next === "\t" || next === "\r") return at;
  }
  return -1;
}

// Lee las relaciones de un documento del BOE. ok: había análisis (las relaciones pueden ser ninguna);
// pending: aún no hay análisis. Un documento que no es un documento del BOE o está mal formado lanza BoeError.
export function parseRelations(xml: string): { status: Extract<ChangesStatus, "ok" | "pending">; changes: Change[] } {
  if (typeof xml !== "string") throw new BoeError("documento no válido");
  const lower = xml.toLowerCase();
  if (lower.includes("<!doctype") || lower.includes("<!entity")) throw new BoeError("XML no válido: DOCTYPE y entidades no admitidos");
  if (openTag(xml, "documento") === -1) throw new BoeError("documento del BOE inesperado");
  const start = openTag(xml, "analisis");
  if (start === -1) return { status: "pending", changes: [] };
  const openEnd = xml.indexOf(">", start);
  if (openEnd === -1) throw new BoeError("XML no válido: etiqueta sin cerrar");
  if (xml[openEnd - 1] === "/") return { status: "pending", changes: [] };
  const close = xml.indexOf("</analisis>", openEnd);
  if (close === -1) throw new BoeError("XML no válido: análisis sin cerrar");
  const root = parseXml(xml.slice(start, close + "</analisis>".length), { attributes: true });
  const refs = childrenNamed(root, "referencias")[0];
  if (refs === undefined) return { status: "pending", changes: [] };
  const changes: Change[] = [];
  for (const group of childrenNamed(refs, "anteriores")) {
    for (const node of childrenNamed(group, "anterior")) {
      if (changes.length >= MAX_CHANGES_PER_ITEM) break;
      const change = readChange(node);
      if (change !== undefined) changes.push(change);
    }
  }
  return { status: "ok", changes };
}

export function buildDocumentUrl(id: string): string {
  if (typeof id !== "string" || !DOCUMENT_ID.test(id)) throw new BoeError("identificador de documento no válido");
  return DOCUMENT_BASE_URL + id;
}

const DOCUMENT_SPEC: DocumentSpec = {
  label: "BOE",
  accept: "application/xml, text/xml",
  contentType: "xml",
  parse: "text",
  emptyStatus: 404,
};

// Resultado de pedir un documento: nunca lanza. requests cuenta todos los intentos, también los fallidos.
export type RelationsFetch = { status: "ok"; body: string; requests: number } | { status: "error"; requests: number };

export async function fetchRelationsDocument(id: string, options: FetchOptions = {}): Promise<RelationsFetch> {
  let requests = 0;
  const inner = options.fetchFn ?? fetch;
  const counting = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests++;
    return inner(input, init);
  }) as typeof fetch;
  try {
    const result = await fetchDocument(buildDocumentUrl(id), id, DOCUMENT_SPEC, { ...options, fetchFn: counting });
    if (result.status === "ok" && typeof result.body === "string") return { status: "ok", body: result.body, requests };
    return { status: "error", requests };
  } catch {
    // Solo importa que ha fallado; el motivo no se registra para no arrastrar contenido.
    return { status: "error", requests };
  }
}

// Identificadores seguidos que aparecen como destino de alguna relación, en el orden de followIds.
export function followedBy(changes: readonly Change[], followIds: readonly string[]): string[] {
  return followIds.filter((f) => changes.some((c) => c.targetId === f));
}
