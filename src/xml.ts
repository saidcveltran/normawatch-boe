// Lector mínimo de XML/RSS, sin dependencias y sin expresiones regulares sobre el documento: recorre el texto con
// indexOf, con topes de tamaño, de profundidad y de nodos. No admite DTD ni declaraciones de entidad (se rechaza
// cualquier <!DOCTYPE o <!ENTITY) y solo expande las cinco entidades predefinidas y las referencias numéricas.
// Los atributos se ignoran: solo importan los elementos y su texto.
import { BoeError } from "./errors.ts";

export const XML_MAX_BYTES = 1024 * 1024;
export const XML_MAX_DEPTH = 16;
export const XML_MAX_NODES = 20_000;

export type XmlNode = { name: string; text: string; children: XmlNode[] };

const fail = (reason: string): never => {
  throw new BoeError(`XML no válido: ${reason}`);
};

const PREDEFINED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

// Expande entidades predefinidas y referencias numéricas; cualquier otra entidad es un error.
function decode(raw: string): string {
  if (!raw.includes("&")) return raw;
  let out = "";
  let pos = 0;
  for (;;) {
    const amp = raw.indexOf("&", pos);
    if (amp === -1) return out + raw.slice(pos);
    out += raw.slice(pos, amp);
    const semi = raw.indexOf(";", amp);
    if (semi === -1 || semi - amp > 10) return fail("entidad no válida");
    const name = raw.slice(amp + 1, semi);
    const predefined = PREDEFINED[name];
    if (predefined !== undefined) {
      out += predefined;
    } else if (name.startsWith("#")) {
      const hex = name.startsWith("#x") || name.startsWith("#X");
      const digits = name.slice(hex ? 2 : 1);
      const valid = digits.length > 0 && [...digits].every((c) => (hex ? "0123456789abcdefABCDEF" : "0123456789").includes(c));
      const code = valid ? Number.parseInt(digits, hex ? 16 : 10) : Number.NaN;
      const control = code < 0x20 && code !== 0x9 && code !== 0xa && code !== 0xd;
      if (!Number.isInteger(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) || control || code === 0) {
        return fail("referencia numérica no válida");
      }
      out += String.fromCodePoint(code);
    } else {
      return fail("entidad no admitida");
    }
    pos = semi + 1;
  }
}

// Posición del '>' que cierra una etiqueta de apertura, respetando las comillas de los atributos.
function tagEnd(xml: string, from: number): number {
  let quote = "";
  for (let i = from; i < xml.length; i++) {
    const ch = xml[i]!;
    if (quote !== "") {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  return -1;
}

export function parseXml(input: string): XmlNode {
  if (typeof input !== "string" || Buffer.byteLength(input, "utf8") > XML_MAX_BYTES) return fail("documento demasiado grande");
  const xml = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const lower = xml.toLowerCase();
  if (lower.includes("<!doctype") || lower.includes("<!entity")) return fail("DOCTYPE y entidades no admitidos");
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  let nodes = 0;
  let pos = 0;
  const addText = (s: string): void => {
    const top = stack[stack.length - 1];
    if (top !== undefined) top.text += s;
    else if (s.trim() !== "") fail("texto fuera del elemento raíz");
  };
  while (pos < xml.length) {
    const lt = xml.indexOf("<", pos);
    if (lt === -1) {
      addText(decode(xml.slice(pos)));
      break;
    }
    if (lt > pos) addText(decode(xml.slice(pos, lt)));
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      if (end === -1) return fail("comentario sin cerrar");
      pos = end + 3;
    } else if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      if (end === -1) return fail("CDATA sin cerrar");
      if (stack.length === 0) return fail("CDATA fuera del elemento raíz");
      addText(xml.slice(lt + 9, end));
      pos = end + 3;
    } else if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt + 2);
      if (end === -1) return fail("instrucción sin cerrar");
      pos = end + 2;
    } else if (xml.startsWith("<!", lt)) {
      return fail("declaración no admitida");
    } else if (xml.startsWith("</", lt)) {
      const end = xml.indexOf(">", lt + 2);
      if (end === -1) return fail("etiqueta de cierre sin terminar");
      const name = xml.slice(lt + 2, end).trim();
      const top = stack.pop();
      if (top === undefined || top.name !== name) return fail("etiquetas mal anidadas");
      pos = end + 1;
    } else {
      const end = tagEnd(xml, lt + 1);
      if (end === -1) return fail("etiqueta sin cerrar");
      let body = xml.slice(lt + 1, end);
      const selfClosing = body.endsWith("/");
      if (selfClosing) body = body.slice(0, -1);
      let n = 0;
      while (n < body.length && !isSpace(body[n]!)) n++;
      const name = body.slice(0, n);
      if (name === "") return fail("etiqueta sin nombre");
      if (++nodes > XML_MAX_NODES) return fail("demasiados elementos");
      if (stack.length === 0 && root !== undefined) return fail("más de un elemento raíz");
      const node: XmlNode = { name, text: "", children: [] };
      const parent = stack[stack.length - 1];
      if (parent !== undefined) parent.children.push(node);
      else root = node;
      if (!selfClosing) {
        if (stack.length >= XML_MAX_DEPTH) return fail("anidamiento excesivo");
        stack.push(node);
      }
      pos = end + 1;
    }
  }
  if (stack.length > 0) return fail("elementos sin cerrar");
  if (root === undefined) return fail("documento vacío");
  return root;
}

export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((c) => c.name === name);
}

// Texto recortado del primer hijo con ese nombre; undefined si no existe.
export function childText(node: XmlNode, name: string): string | undefined {
  const child = node.children.find((c) => c.name === name);
  return child === undefined ? undefined : child.text.trim();
}
