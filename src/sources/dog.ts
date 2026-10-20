// Fuente DOG (Xunta de Galicia): RSS oficial de la sección «I. Disposiciones generales», licencia CC BY-SA 4.0.
// El RSS solo ofrece el último número con esa sección, no una consulta por fecha: un día se considera cubierto si
// la fecha del RSS coincide; si no, no hay elementos. Se lee con el lector XML acotado de xml.ts.
import { BoeError } from "../errors.ts";
import { normTypeOf } from "../classify.ts";
import { fetchDocument } from "../http.ts";
import type { DocumentSpec, FetchOptions, FetchResult } from "../http.ts";
import { MAX_TEXT, cleanText, nameGuardHit } from "../parse.ts";
import type { Dropped, OutputItem } from "../parse.ts";
import { childText, childrenNamed, parseXml } from "../xml.ts";
import type { XmlNode } from "../xml.ts";
import type { SourceAdapter } from "./types.ts";

export const DOG_HOST = "www.xunta.gal";
export const DOG_SOURCE_LINE = "Fuente: Xunta de Galicia, Diario Oficial de Galicia (CC BY-SA 4.0)";
export const DOG_SOURCE_URL = "https://www.xunta.gal/diario-oficial-galicia";
const DOG_FEED_PATH = "/diario-oficial-galicia/rss/Seccion1_es.rss";
const GENERAL_SECTION = "i. disposiciones generales";
const LINK_FORMAT = /^https:\/\/www\.xunta\.gal\/dog\/Publicados\/([0-9]{4})\/([0-9]{8})\/([A-Za-z0-9-]{1,76})_es\.html$/;
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

export function buildDogUrl(): string {
  return `https://${DOG_HOST}${DOG_FEED_PATH}`;
}

const SPEC: DocumentSpec = {
  label: "DOG",
  accept: "application/rss+xml, application/xml;q=0.9",
  contentType: "xml",
  parse: "text",
  emptyStatus: 404,
};

// El mismo RSS sirve para todos los días de la ejecución: se pide una sola vez, y el resultado (el documento o el
// fallo) se memoriza. Un 404 del RSS no es «un día sin boletín» sino un fallo del DOG, que solo falla los días del DOG.
export async function fetchDogDay(isoDate: string, options: FetchOptions = {}): Promise<FetchResult> {
  const cached = options.memo?.get("DOG");
  if (typeof cached === "string") return { status: "ok", body: cached, requests: 0 };
  if (cached instanceof BoeError) throw cached;
  let res: FetchResult;
  try {
    res = await fetchDocument(buildDogUrl(), isoDate, SPEC, options);
  } catch (err) {
    if (err instanceof BoeError) options.memo?.set("DOG", err);
    throw err;
  }
  if (res.status !== "ok" || typeof res.body !== "string") {
    const failure = new BoeError("el DOG no ofrece el RSS (respondió 404)");
    options.memo?.set("DOG", failure);
    throw failure;
  }
  options.memo?.set("DOG", res.body);
  return res;
}

// El RSS ya leído se reutiliza para todas las fechas de la ejecución: se analiza una sola vez.
let parsed: { body: string; root: XmlNode } | undefined;
function readFeed(body: string): XmlNode {
  if (parsed !== undefined && parsed.body === body) return parsed.root;
  const root = parseXml(body);
  parsed = { body, root };
  return root;
}

// «Fri, 02 Oct 2026 00:00:00 +0200» -> «2026-10-02» (la fecha tal como la escribe el DOG, sin zonas horarias).
function rssDate(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const parts = v.trim().split(/\s+/);
  const day = parts[1];
  const month = parts[2] === undefined ? undefined : MONTHS[parts[2]];
  const year = parts[3];
  if (day === undefined || month === undefined || year === undefined || !/^[0-9]{1,2}$/.test(day) || !/^[0-9]{4}$/.test(year)) return undefined;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

export function parseDog(body: unknown, date: string, retrievedAt: string): { items: OutputItem[]; dropped: Dropped } {
  if (typeof body !== "string") throw new BoeError("documento del DOG inesperado");
  const root = readFeed(body);
  const channel = root.name === "rss" ? childrenNamed(root, "channel")[0] : undefined;
  if (channel === undefined) throw new BoeError("documento del DOG inesperado: falta channel");
  const dropped: Dropped = { badId: 0, badUrl: 0, nameGuard: 0, tooLong: 0, otherSection: 0 };
  const feedDate = rssDate(childText(channel, "pubDate") ?? childText(channel, "lastBuildDate"));
  if (feedDate === undefined) throw new BoeError("documento del DOG inesperado: falta la fecha");
  if (feedDate !== date) return { items: [], dropped };
  const items: OutputItem[] = [];
  for (const entry of childrenNamed(channel, "item")) {
    const link = cleanText(childText(entry, "link") ?? "");
    // El primer elemento del RSS es el índice del número (un PDF): no es una disposición.
    if (link.includes("/Indice") && link.endsWith(".pdf")) continue;
    const description = cleanText(childText(entry, "description") ?? "");
    const br = description.toLowerCase().indexOf("</br>");
    const sectionLabel = (br === -1 ? description : description.slice(0, br)).trim();
    if (sectionLabel.normalize("NFC").toLowerCase() !== GENERAL_SECTION) {
      dropped.otherSection = (dropped.otherSection ?? 0) + 1;
      continue;
    }
    if (link.length > MAX_TEXT) {
      dropped.badUrl++;
      continue;
    }
    const m = LINK_FORMAT.exec(link);
    if (m === null || m[2] !== date.replaceAll("-", "")) {
      dropped.badId++;
      continue;
    }
    const title = cleanText(childText(entry, "title") ?? "");
    if (nameGuardHit(title)) {
      dropped.nameGuard++;
      continue;
    }
    const department = br === -1 ? "" : description.slice(br + 5).trim();
    if (department.length > MAX_TEXT || title.length > MAX_TEXT) {
      dropped.tooLong++;
      continue;
    }
    items.push({
      id: `DOG-${m[3]}`,
      date,
      section: "I. Disposiciones generales",
      department,
      epigraph: "",
      title,
      urlHtml: link,
      retrievedAt,
      source: DOG_SOURCE_LINE,
      sourceUrl: DOG_SOURCE_URL,
      normType: normTypeOf(title, department),
      bulletin: "DOG",
    });
  }
  return { items, dropped };
}

export const dog: SourceAdapter = {
  id: "DOG",
  fetchDay: (date, options) => fetchDogDay(date, options),
  parseDay: (body, date, retrievedAt) => parseDog(body, date, retrievedAt),
};
