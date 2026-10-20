// Validación y normalización de la entrada del Actor. Solo biblioteca estándar.
// Cada campo se comprueba antes de hacer ninguna petición; una entrada incorrecta falla con un mensaje claro.
import { BoeError } from "./errors.ts";
import { validDate } from "./dates.ts";
import { BULLETINS, isBulletin } from "./sources/ids.ts";
import { isNormType, normTypeOf } from "./classify.ts";
import { validEmail, validSlackWebhookUrl, validTelegramChatId, validTelegramToken } from "./notify.ts";
import type { Channels } from "./notify.ts";

export const MAX_RANGE_DAYS = 366;
// Hasta este número de días de diferencia la ejecución se comporta como en 1.2 (orden ascendente y pausa elegida).
// Por encima, el orden es del más reciente al más antiguo y la pausa efectiva no baja de LONG_RANGE_MIN_DELAY_MS.
export const LONG_RANGE_DAYS = 31;
export const LONG_RANGE_MIN_DELAY_MS = 1000;
export const DEFAULT_MAX_ITEMS = 500;
export const MAX_ITEMS_LIMIT = 10_000;
export const DEFAULT_DELAY_MS = 1000;
export const MIN_DELAY_MS = 500;
export const MAX_DELAY_MS = 10_000;
export const MAX_LIST_ENTRIES = 50;
export const MAX_ENTRY_CHARS = 200;
export const MAX_FOLLOW_IDS = 100;
// Identificador de una norma del BOE que se puede seguir (el mismo de la sección I): BOE-A-AAAA-N.
const FOLLOW_ID = /^BOE-A-\d{4}-\d{1,7}$/;

export type RunInput = {
  dates: string[];
  maxItems: number;
  requestDelayMs: number;
  // Solo aparece cuando vale verdadero.
  onlyNew?: true;
  // Textos en minúsculas; solo aparecen cuando hay algún filtro.
  departments?: string[];
  keywords?: string[];
  // Tipos de norma del BOE (valores exactos de la lista cerrada); solo aparece cuando hay alguno.
  normTypes?: string[];
  // Secciones del BOE que se leen, ordenadas; solo aparece cuando no es la sección I sola (por ahora, con la III).
  sections?: string[];
  // Boletines que se leen, en orden canónico; solo aparece cuando no es el BOE solo.
  bulletins?: string[];
  // Opción relations (1.6): solo aparece cuando vale verdadero (también si hay followIds, que la activan).
  relations?: true;
  // Identificadores BOE-A seguidos, en mayúsculas, sin repetidos y ordenados; solo aparece cuando hay alguno.
  followIds?: string[];
};

export type NormalizedInput = {
  dateFrom: string;
  dateTo: string;
  maxItems: number;
  requestDelayMs: number;
  onlyNew: boolean;
  departments: string[];
  keywords: string[];
  normTypes: string[];
  sections: string[];
  bulletins: string[];
  relations: boolean;
  followIds: string[];
};

export type Filters = { departments?: string[]; keywords?: string[]; normTypes?: string[] };

// ---------- fechas ----------

export { validDate };

function dayNumber(value: string): number {
  return Math.round(Date.parse(`${value}T00:00:00Z`) / 86_400_000);
}

function addDays(value: string, days: number): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Fecha de hoy en Madrid, que puede diferir de la fecha UTC cerca de la medianoche.
export function madridToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ---------- campos ----------

function intField(input: Record<string, unknown>, name: string, def: number, min: number, max: number): number {
  const v = input[name];
  if (v === undefined || v === null) return def;
  if (typeof v !== "number" || !Number.isInteger(v)) throw new BoeError(`${name} debe ser un número entero`);
  if (v < min) throw new BoeError(`${name} debe ser al menos ${min}`);
  if (v > max) throw new BoeError(`${name} debe ser como máximo ${max}`);
  return v;
}

function boolField(input: Record<string, unknown>, name: string): boolean {
  const v = input[name];
  if (v === undefined || v === null) return false;
  if (typeof v !== "boolean") throw new BoeError(`${name} debe ser verdadero o falso`);
  return v;
}

function dateField(input: Record<string, unknown>, name: string): string | undefined {
  const v = input[name];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !validDate(v)) throw new BoeError(`${name} debe ser una fecha con formato AAAA-MM-DD`);
  return v;
}

// Lista de textos literales: máximo de entradas y de longitud; las entradas en blanco se ignoran
// y el resto se normaliza a NFC y se pasa a minúsculas.
function listField(input: Record<string, unknown>, name: string): string[] {
  const v = input[name];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new BoeError(`${name} debe ser una lista de textos`);
  if (v.length > MAX_LIST_ENTRIES) throw new BoeError(`${name} admite como máximo ${MAX_LIST_ENTRIES} entradas`);
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry !== "string") throw new BoeError(`${name} solo admite textos`);
    if (entry.length > MAX_ENTRY_CHARS) {
      throw new BoeError(`cada entrada de ${name} debe tener como máximo ${MAX_ENTRY_CHARS} caracteres`);
    }
    const t = entry.trim();
    if (t !== "") out.push(t.normalize("NFC").toLowerCase());
  }
  return out;
}

// Tipos de norma: cada entrada debe ser exactamente uno de los valores de la lista cerrada; si no, la
// entrada es incorrecta. Los repetidos se unifican y la lista vacía significa todos los tipos.
function normTypesField(input: Record<string, unknown>): string[] {
  const v = input["normTypes"];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new BoeError("normTypes debe ser una lista de tipos de norma");
  if (v.length > MAX_LIST_ENTRIES) throw new BoeError(`normTypes admite como máximo ${MAX_LIST_ENTRIES} entradas`);
  const out: string[] = [];
  for (const entry of v) {
    if (!isNormType(entry)) throw new BoeError("normTypes contiene un tipo de norma no admitido");
    if (!out.includes(entry)) out.push(entry);
  }
  return out;
}

// Secciones del BOE: solo "1" (disposiciones generales) y "3" (otras disposiciones, con los filtros de
// section3.ts). Los repetidos se unifican y la lista vacía o ausente significa solo la sección I.
function sectionsField(input: Record<string, unknown>): string[] {
  const v = input["sections"];
  if (v === undefined || v === null) return ["1"];
  if (!Array.isArray(v)) throw new BoeError("sections debe ser una lista de secciones");
  if (v.length > MAX_LIST_ENTRIES) throw new BoeError(`sections admite como máximo ${MAX_LIST_ENTRIES} entradas`);
  const out = new Set<string>();
  for (const entry of v) {
    if (entry !== "1" && entry !== "3") throw new BoeError('sections solo admite "1" (disposiciones generales) y "3" (otras disposiciones)');
    out.add(entry);
  }
  return out.size === 0 ? ["1"] : [...out].sort();
}

// Boletines: lista de valores exactos de la lista cerrada. Los repetidos se unifican, el orden es el canónico y la
// lista vacía o ausente significa solo el BOE. La sección III de 1.4 se aplica únicamente al BOE.
function bulletinsField(input: Record<string, unknown>): string[] {
  const v = input["bulletins"];
  if (v === undefined || v === null) return ["BOE"];
  if (!Array.isArray(v)) throw new BoeError("bulletins debe ser una lista de boletines");
  if (v.length > MAX_LIST_ENTRIES) throw new BoeError(`bulletins admite como máximo ${MAX_LIST_ENTRIES} entradas`);
  const chosen = new Set<string>();
  for (const entry of v) {
    if (!isBulletin(entry)) throw new BoeError(`bulletins solo admite ${BULLETINS.map((b) => `"${b}"`).join(", ")}`);
    chosen.add(entry);
  }
  return chosen.size === 0 ? ["BOE"] : BULLETINS.filter((b) => chosen.has(b));
}

// Normas que se siguen: identificadores BOE-A-AAAA-N. Se recortan, se pasan a mayúsculas y se unifican los repetidos;
// las entradas en blanco se ignoran. Cualquier otra forma, o más de 100 entradas, es una entrada incorrecta.
// El mensaje no repite el valor recibido.
function followIdsField(input: Record<string, unknown>): string[] {
  const v = input["followIds"];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new BoeError("followIds debe ser una lista de identificadores del BOE");
  if (v.length > MAX_FOLLOW_IDS) throw new BoeError(`followIds admite como máximo ${MAX_FOLLOW_IDS} entradas`);
  const out = new Set<string>();
  for (const entry of v) {
    if (typeof entry !== "string") throw new BoeError("followIds solo admite textos");
    const id = entry.trim().toUpperCase();
    if (id === "") continue;
    if (!FOLLOW_ID.test(id)) throw new BoeError("followIds contiene un identificador no válido (la forma es BOE-A-AAAA-N, por ejemplo BOE-A-2021-3698)");
    out.add(id);
  }
  return [...out].sort();
}

// Aplica los valores por defecto y comprueba todos los límites.
export function normalizeInput(input: Record<string, unknown>, today: string): NormalizedInput {
  const dateFrom = dateField(input, "dateFrom") ?? today;
  const dateTo = dateField(input, "dateTo") ?? dateFrom;
  if (dayNumber(dateFrom) > dayNumber(today)) throw new BoeError("dateFrom no puede ser posterior a hoy (fecha futura)");
  if (dayNumber(dateTo) > dayNumber(today)) throw new BoeError("dateTo no puede ser posterior a hoy (fecha futura)");
  if (dayNumber(dateTo) < dayNumber(dateFrom)) throw new BoeError("dateTo no puede ser anterior a dateFrom");
  if (dayNumber(dateTo) - dayNumber(dateFrom) > MAX_RANGE_DAYS) {
    throw new BoeError(`dateTo debe ser como máximo ${MAX_RANGE_DAYS} días posterior a dateFrom`);
  }
  return {
    dateFrom,
    dateTo,
    maxItems: intField(input, "maxItems", DEFAULT_MAX_ITEMS, 1, MAX_ITEMS_LIMIT),
    requestDelayMs: intField(input, "requestDelayMs", DEFAULT_DELAY_MS, MIN_DELAY_MS, MAX_DELAY_MS),
    onlyNew: boolField(input, "onlyNew"),
    departments: listField(input, "departments"),
    keywords: listField(input, "keywords"),
    normTypes: normTypesField(input),
    sections: sectionsField(input),
    bulletins: bulletinsField(input),
    relations: boolField(input, "relations"),
    followIds: followIdsField(input),
  };
}

export function parseInput(input: Record<string, unknown>, today: string): RunInput {
  const n = normalizeInput(input, today);
  const dates: string[] = [];
  for (let d = n.dateFrom; dayNumber(d) <= dayNumber(n.dateTo); d = addDays(d, 1)) dates.push(d);
  const long = dayNumber(n.dateTo) - dayNumber(n.dateFrom) > LONG_RANGE_DAYS;
  // Rango largo: primero lo más reciente (así maxItems conserva lo último) y pausa mínima de 1 s entre peticiones.
  if (long) dates.reverse();
  return {
    dates,
    maxItems: n.maxItems,
    requestDelayMs: long ? Math.max(n.requestDelayMs, LONG_RANGE_MIN_DELAY_MS) : n.requestDelayMs,
    ...(n.onlyNew ? { onlyNew: true as const } : {}),
    ...(n.departments.length > 0 ? { departments: n.departments } : {}),
    ...(n.keywords.length > 0 ? { keywords: n.keywords } : {}),
    ...(n.normTypes.length > 0 ? { normTypes: n.normTypes } : {}),
    ...(n.sections.length === 1 && n.sections[0] === "1" ? {} : { sections: n.sections }),
    ...(n.bulletins.length === 1 && n.bulletins[0] === "BOE" ? {} : { bulletins: n.bulletins }),
    // Seguir normas implica leer las relaciones.
    ...(n.relations || n.followIds.length > 0 ? { relations: true as const } : {}),
    ...(n.followIds.length > 0 ? { followIds: n.followIds } : {}),
  };
}

// ---------- filtros ----------

// Coincidencia por subcadena en minúsculas y NFC, nunca como expresión regular: una palabra clave
// con forma de patrón se trata como texto literal. Dentro de cada lista basta una coincidencia;
// entre listas deben cumplirse todas. El tipo de norma se compara con el valor exacto de la lista cerrada;
// si el elemento aún no lo trae, se deriva del título.
export function matchesFilters(
  item: { department: string; title: string; normType?: string },
  filters: Filters,
): boolean {
  if (filters.departments !== undefined && filters.departments.length > 0) {
    const dep = item.department.normalize("NFC").toLowerCase();
    if (!filters.departments.some((d) => dep.includes(d))) return false;
  }
  if (filters.keywords !== undefined && filters.keywords.length > 0) {
    const title = item.title.normalize("NFC").toLowerCase();
    if (!filters.keywords.some((k) => title.includes(k))) return false;
  }
  if (filters.normTypes !== undefined && filters.normTypes.length > 0) {
    const type = item.normType ?? normTypeOf(item.title, item.department);
    if (!filters.normTypes.includes(type)) return false;
  }
  return true;
}

// ---------- avisos ----------

export type NotifyInput = { channels: Channels; whenEmpty: boolean };

// Texto opcional de un canal: vacío o ausente significa que el canal no se usa. Los mensajes de error
// nombran el campo y nunca repiten su valor, porque puede ser un secreto.
function channelText(input: Record<string, unknown>, name: string): string | undefined {
  const v = input[name];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new BoeError(`${name} debe ser un texto`);
  const t = v.trim();
  return t === "" ? undefined : t;
}

// Valida los campos de aviso antes de hacer ninguna petición. Un canal solo se activa con todos sus campos;
// si falta alguno o tiene un formato incorrecto, la entrada es no válida (código de salida 2).
export function parseNotifyInput(input: Record<string, unknown>): NotifyInput {
  const channels: Channels = {};
  const email = channelText(input, "emailTo");
  if (email !== undefined) {
    if (!validEmail(email)) throw new BoeError("emailTo debe ser una única dirección de correo válida (sin comas, espacios ni saltos de línea)");
    channels.email = email;
  }
  const token = channelText(input, "telegramBotToken");
  const chatId = channelText(input, "telegramChatId");
  if (token !== undefined || chatId !== undefined) {
    if (token === undefined) throw new BoeError("telegramBotToken es obligatorio si se indica telegramChatId");
    if (chatId === undefined) throw new BoeError("telegramChatId es obligatorio si se indica telegramBotToken");
    if (!validTelegramToken(token)) throw new BoeError("telegramBotToken no tiene el formato de un token de bot de Telegram");
    if (!validTelegramChatId(chatId)) throw new BoeError("telegramChatId debe ser un número (puede ser negativo) o un nombre de canal con @");
    channels.telegram = { botToken: token, chatId };
  }
  const hook = channelText(input, "slackWebhookUrl");
  if (hook !== undefined) {
    if (!validSlackWebhookUrl(hook)) throw new BoeError("slackWebhookUrl no es un webhook entrante de Slack válido (https://hooks.slack.com/services/…)");
    channels.slackWebhookUrl = hook;
  }
  return { channels, whenEmpty: boolField(input, "notifyWhenEmpty") };
}
