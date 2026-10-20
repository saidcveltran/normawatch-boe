// Validación y normalización de la entrada del Actor. Solo biblioteca estándar.
// Cada campo se comprueba antes de hacer ninguna petición; una entrada incorrecta falla con un mensaje claro.
import { BoeError } from "./errors.ts";
import { isNormType, normTypeOf } from "./classify.ts";
import { validEmail, validSlackWebhookUrl, validTelegramChatId, validTelegramToken } from "./notify.ts";
import type { Channels } from "./notify.ts";

export const MAX_RANGE_DAYS = 31;
export const DEFAULT_MAX_ITEMS = 500;
export const MAX_ITEMS_LIMIT = 10_000;
export const DEFAULT_DELAY_MS = 1000;
export const MIN_DELAY_MS = 500;
export const MAX_DELAY_MS = 10_000;
export const MAX_LIST_ENTRIES = 50;
export const MAX_ENTRY_CHARS = 200;

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
};

export type Filters = { departments?: string[]; keywords?: string[]; normTypes?: string[] };

// ---------- fechas ----------

// Estricta: solo AAAA-MM-DD de un día real del calendario.
export function validDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

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
  };
}

export function parseInput(input: Record<string, unknown>, today: string): RunInput {
  const n = normalizeInput(input, today);
  const dates: string[] = [];
  for (let d = n.dateFrom; dayNumber(d) <= dayNumber(n.dateTo); d = addDays(d, 1)) dates.push(d);
  return {
    dates,
    maxItems: n.maxItems,
    requestDelayMs: n.requestDelayMs,
    ...(n.onlyNew ? { onlyNew: true as const } : {}),
    ...(n.departments.length > 0 ? { departments: n.departments } : {}),
    ...(n.keywords.length > 0 ? { keywords: n.keywords } : {}),
    ...(n.normTypes.length > 0 ? { normTypes: n.normTypes } : {}),
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
