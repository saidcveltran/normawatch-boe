// Resumen de lo entregado en una ejecución, listo para correo, Telegram o Slack. Función pura, solo
// biblioteca estándar. Todo texto del BOE se escapa según el destino y los enlaces solo salen de los
// campos url* ya validados (https://www.boe.es/), que aquí se vuelven a comprobar.
import { SOURCE_LINE } from "./sources/boe.ts";
import { UNSAFE_CHARS } from "./parse.ts";
import type { OutputItem } from "./parse.ts";

export type DigestItem = Pick<OutputItem, "department" | "title" | "normType" | "urlHtml" | "urlPdf"> & { bulletin?: string; source?: string };
export type DigestOptions = {
  dateFrom: string;
  dateTo: string;
  // Enlace al conjunto de datos de la ejecución; solo se admite el de la consola de Apify.
  datasetUrl?: string;
  // Boletines elegidos en la entrada; sin ellos, solo se nombra el BOE salvo que los elementos sean de otros.
  bulletins?: readonly string[];
};
export type Flavour = "telegram" | "slack";

export type Digest = {
  subject: string;
  text: string;
  html: string;
  // Número de elementos del resumen (puede ser mayor que los que caben en cada destino).
  itemCount: number;
  // Mensajes de chat de como máximo maxLen caracteres y como máximo maxMessages unidades.
  chunks: (maxLen: number, flavour: Flavour, maxMessages?: number) => string[];
};

export const EMAIL_MAX_ITEMS = 100;
export const MAX_MESSAGES = 10;
// En los chats se acortan los textos largos solo para mostrarlos; el conjunto de datos no se toca.
const CHAT_TITLE_MAX = 300;
const CHAT_DEPARTMENT_MAX = 120;

const SAFE_BOE_URL = /^https:\/\/(?:www\.boe\.es|juntadeandalucia\.es|www\.juntadeandalucia\.es|www\.xunta\.gal)\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/;
const DATASET_URL = /^https:\/\/console\.apify\.com\/storage\/datasets\/[A-Za-z0-9]{5,40}$/;

const STOP_TEXT = "Para dejar de recibir estos avisos, vacía el campo correspondiente en la entrada de NormaWatch o quita la programación.";
// CC BY 4.0 exige enlazar la licencia: las líneas de fuente del BOJA y del DOG llevan su URL en el pie.
function withLicenceUrl(line: string): string {
  if (line.endsWith("(CC BY-SA 4.0)")) return `${line} https://creativecommons.org/licenses/by-sa/4.0/`;
  if (line.endsWith("(CC BY 4.0)")) return `${line} https://creativecommons.org/licenses/by/4.0/`;
  return line;
}

// Pie con la atribución de cada fuente presente (solo el BOE si no hay otras): conserva la licencia de cada una.
function footerText(items: readonly DigestItem[]): string {
  const sources: string[] = [];
  for (const it of items) {
    const s = withLicenceUrl(it.source ?? SOURCE_LINE);
    if (!sources.includes(s)) sources.push(s);
  }
  if (sources.length === 0) sources.push(SOURCE_LINE);
  return `${sources.join("; ")}. Resumen generado por NormaWatch; no es un texto oficial.`;
}

// Verdadero si algún elemento no es del BOE: entonces cada elemento muestra su boletín.
const isMixed = (items: readonly DigestItem[]): boolean => items.some((it) => it.bulletin !== undefined && it.bulletin !== "BOE");

function boletinesLabel(items: readonly DigestItem[], opts: DigestOptions): string {
  const names = opts.bulletins !== undefined && opts.bulletins.length > 0 ? [...opts.bulletins] : isMixed(items) ? [...new Set(items.map((i) => i.bulletin ?? "BOE"))] : ["BOE"];
  return names.length === 1 && names[0] === "BOE" ? "el BOE" : `los boletines ${names.join(", ")}`;
}

function escapeHtml(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// Slack mrkdwn: basta escapar & < > para que el texto no forme enlaces, menciones ni marcas.
function escapeSlack(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// Una sola línea: los saltos y tabuladores del título se vuelven espacios.
// Además se quitan los controles y los caracteres bidireccionales, que no deben llegar a ningún aviso.
const oneLine = (v: string): string => v.replace(/\s+/g, " ").replace(UNSAFE_CHARS, "").trim();

function cut(v: string, max: number): string {
  const chars = [...v];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : v;
}

const safeUrl = (v: string | undefined): string | undefined => (v !== undefined && SAFE_BOE_URL.test(v) ? v : undefined);

function ddmmyyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "fecha desconocida";
}

function subjectFor(count: number, o: DigestOptions, where: string): string {
  const when = o.dateFrom === o.dateTo ? ddmmyyyy(o.dateFrom) : `${ddmmyyyy(o.dateFrom)} a ${ddmmyyyy(o.dateTo)}`;
  const what = count === 0 ? "sin disposiciones nuevas" : count === 1 ? "1 disposición nueva" : `${count} disposiciones nuevas`;
  return `NormaWatch: ${what} en ${where} (${when})`;
}

type Group = { department: string; items: DigestItem[] };

// Agrupa por departamento en orden de primera aparición.
function groupByDepartment(items: readonly DigestItem[]): Group[] {
  const groups = new Map<string, Group>();
  for (const it of items) {
    const g = groups.get(it.department) ?? { department: it.department, items: [] };
    g.items.push(it);
    groups.set(it.department, g);
  }
  return [...groups.values()];
}

function moreLine(n: number): string {
  return `y ${n} más: ver el conjunto de datos`;
}

function buildText(shown: readonly DigestItem[], total: number, subject: string, datasetUrl: string | undefined, footer: string, mixed: boolean): string {
  const lines: string[] = [subject, ""];
  for (const g of groupByDepartment(shown)) {
    lines.push(oneLine(g.department));
    for (const it of g.items) {
      lines.push(`- ${mixed ? `[${it.bulletin ?? "BOE"}] ` : ""}[${it.normType}] ${oneLine(it.title)}`);
      const h = safeUrl(it.urlHtml);
      const p = safeUrl(it.urlPdf);
      if (h) lines.push(`  HTML: ${h}`);
      if (p) lines.push(`  PDF: ${p}`);
    }
    lines.push("");
  }
  if (total > shown.length) lines.push(`${moreLine(total - shown.length)}${datasetUrl ? `: ${datasetUrl}` : ""}`, "");
  lines.push(footer, STOP_TEXT);
  return lines.join("\n");
}

function buildHtml(shown: readonly DigestItem[], total: number, subject: string, datasetUrl: string | undefined, footer: string, mixed: boolean): string {
  const out: string[] = [`<!doctype html><html lang="es"><body>`, `<h2>${escapeHtml(subject)}</h2>`];
  for (const g of groupByDepartment(shown)) {
    out.push(`<h3>${escapeHtml(oneLine(g.department))}</h3>`, "<ul>");
    for (const it of g.items) {
      const links: string[] = [];
      const h = safeUrl(it.urlHtml);
      const p = safeUrl(it.urlPdf);
      if (h) links.push(`<a href="${escapeHtml(h)}">HTML</a>`);
      if (p) links.push(`<a href="${escapeHtml(p)}">PDF</a>`);
      out.push(`<li>${mixed ? `<strong>${escapeHtml(it.bulletin ?? "BOE")}</strong> · ` : ""}<strong>${escapeHtml(it.normType)}</strong> · ${escapeHtml(oneLine(it.title))}${links.length > 0 ? `<br>${links.join(" · ")}` : ""}</li>`);
    }
    out.push("</ul>");
  }
  if (total > shown.length) {
    const more = escapeHtml(moreLine(total - shown.length));
    out.push(`<p>${datasetUrl ? `${more}: <a href="${escapeHtml(datasetUrl)}">conjunto de datos</a>` : more}</p>`);
  }
  out.push(`<hr><p><small>${escapeHtml(footer)}<br>${escapeHtml(STOP_TEXT)}</small></p>`, "</body></html>");
  return out.join("\n");
}

type Renderer = {
  bold: (v: string) => string;
  text: (v: string) => string;
  link: (url: string, label: string) => string;
};

const RENDERERS: Record<Flavour, Renderer> = {
  telegram: { bold: (v) => `<b>${v}</b>`, text: escapeHtml, link: (u, l) => `<a href="${escapeHtml(u)}">${l}</a>` },
  slack: { bold: (v) => `*${v}*`, text: escapeSlack, link: (u, l) => `<${u}|${l}>` },
};

function chatBlock(it: DigestItem, r: Renderer, withDepartment: boolean, mixed: boolean): string {
  const head = withDepartment ? `${r.bold(r.text(cut(oneLine(it.department), CHAT_DEPARTMENT_MAX)))}\n` : "";
  const links: string[] = [];
  const h = safeUrl(it.urlHtml);
  const p = safeUrl(it.urlPdf);
  if (h) links.push(r.link(h, "HTML"));
  if (p) links.push(r.link(p, "PDF"));
  const line = `${mixed ? `${r.bold(r.text(it.bulletin ?? "BOE"))} · ` : ""}${r.bold(r.text(it.normType))} · ${r.text(cut(oneLine(it.title), CHAT_TITLE_MAX))}`;
  return `${head}${line}${links.length > 0 ? `\n${links.join(" · ")}` : ""}`;
}

function chatChunks(
  items: readonly DigestItem[],
  subject: string,
  datasetUrl: string | undefined,
  maxLen: number,
  flavour: Flavour,
  maxMessages: number,
  footerPlain: string,
): string[] {
  const r = RENDERERS[flavour];
  const mixed = isMixed(items);
  const datasetPart = datasetUrl ? `\n${r.link(datasetUrl, "conjunto de datos")}` : "";
  const footer = `${r.text(footerPlain)}\n${r.text(STOP_TEXT)}`;
  // Reserva fija para el pie y la línea «y N más», de modo que la última unidad siempre los admita.
  const reserve = footer.length + moreLine(items.length).length + datasetPart.length + 4;
  const limit = Math.max(200, maxLen - reserve);
  const ordered = groupByDepartment(items).flatMap((g) => g.items);
  const messages: string[] = [];
  let current = r.bold(r.text(subject));
  let currentDept: string | undefined;
  let consumed = 0;
  const cap = Math.max(1, maxMessages);
  for (const it of ordered) {
    let block = chatBlock(it, r, currentDept !== it.department, mixed);
    if (current.length + 2 + block.length > limit) {
      if (messages.length + 1 >= cap) break;
      messages.push(current);
      current = "";
      currentDept = undefined;
      block = chatBlock(it, r, true, mixed);
      if (block.length > limit) block = r.text(cut(oneLine(it.normType), 50));
    }
    current = current === "" ? block : `${current}\n\n${block}`;
    currentDept = it.department;
    consumed++;
  }
  const rest = ordered.length - consumed;
  const tail = `${rest > 0 ? `${moreLine(rest)}${datasetPart}\n\n` : ""}${footer}`;
  messages.push(current === "" ? tail : `${current}\n\n${tail}`);
  return messages;
}

export function buildDigest(items: readonly DigestItem[], opts: DigestOptions): Digest {
  const subject = subjectFor(items.length, opts, boletinesLabel(items, opts));
  const footer = footerText(items);
  const mixed = isMixed(items);
  const datasetUrl = opts.datasetUrl !== undefined && DATASET_URL.test(opts.datasetUrl) ? opts.datasetUrl : undefined;
  const shown = items.slice(0, EMAIL_MAX_ITEMS);
  return {
    subject,
    text: buildText(shown, items.length, subject, datasetUrl, footer, mixed),
    html: buildHtml(shown, items.length, subject, datasetUrl, footer, mixed),
    itemCount: items.length,
    chunks: (maxLen, flavour, maxMessages = MAX_MESSAGES) =>
      chatChunks(items, subject, datasetUrl, maxLen, flavour, Math.min(maxMessages, MAX_MESSAGES), footer),
  };
}
