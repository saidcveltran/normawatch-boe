// Envío del resumen a los canales configurados: correo (apify/send-mail), Telegram y Slack.
// Solo biblioteca estándar; los transportes (callActor y fetch) se inyectan, así que aquí no hay
// dependencia de Apify. Reglas de seguridad:
//  - los servidores de destino son constantes (api.telegram.org y hooks.slack.com): la entrada no
//    puede dirigir las peticiones a otro sitio;
//  - redirect: "error", tiempo máximo de 15 s y lectura de la respuesta limitada a 64 KB;
//  - todo error se captura y solo se registra su nombre y el estado HTTP, nunca su mensaje, su causa
//    ni la URL, que podrían contener el token o el webhook;
//  - como máximo 10 mensajes por canal y ejecución, con la separación que piden Telegram y Slack, y una
//    única espera por 429.
import { errName } from "./errors.ts";
import { buildDigest, MAX_MESSAGES } from "./digest.ts";
import type { Digest, DigestOptions } from "./digest.ts";
import type { OutputItem } from "./parse.ts";

export type ChannelName = "email" | "telegram" | "slack";

export type Channels = {
  // Una sola dirección: la de la cuenta de Apify del usuario (plan gratuito).
  email?: string;
  telegram?: { botToken: string; chatId: string };
  slackWebhookUrl?: string;
};

export type NotifyPlan = { channels: Channels; whenEmpty: boolean };

export type NotifyResult = { channel: ChannelName; ok: boolean; sent: number; code?: string };

export type NotifyDeps = {
  callActor: (actorId: string, input: Record<string, unknown>, options: { memory: number; timeout: number; log: null }) => Promise<{ status: string }>;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  log: {
    info: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
  };
};

export type NotifyReport = { ok: boolean; statusMessage: string; results: NotifyResult[] };

export type Notifier = {
  // Con verdadero se avisa también cuando no hay elementos nuevos.
  whenEmpty: boolean;
  send: (items: OutputItem[]) => Promise<NotifyReport>;
};

export const SEND_MAIL_ACTOR = "apify/send-mail";
export const SEND_MAIL_MEMORY_MB = 256;
export const SEND_MAIL_TIMEOUT_SECS = 120;
export const TELEGRAM_MAX_CHARS = 4000;
export const SLACK_MAX_CHARS = 3500;
export const NOTIFY_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 64 * 1024;
export const SPACING_MS = 1100;
export const TELEGRAM_GROUP_SPACING_MS = 3100;
export const MAX_RETRY_WAIT_MS = 30_000;

const TELEGRAM_HOST = "api.telegram.org";
const SLACK_ORIGIN = "https://hooks.slack.com";

// ---------- validación ----------

const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const TOKEN_RE = /^[0-9]{5,15}:[A-Za-z0-9_-]{30,64}$/;
const CHAT_NUMERIC_RE = /^-?[0-9]{1,20}$/;
const CHAT_NAME_RE = /^@[A-Za-z0-9_]{5,32}$/;
const SLACK_PATH_RE = /^\/services\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+){2}$/;

// Una única dirección: sin comas, espacios, saltos de línea, nombres ni ángulos.
export const validEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v);

// El token solo puede tener esta forma, de modo que nada más entre en la ruta de la URL.
export const validTelegramToken = (v: unknown): v is string => typeof v === "string" && TOKEN_RE.test(v);

export const validTelegramChatId = (v: unknown): v is string => typeof v === "string" && (CHAT_NUMERIC_RE.test(v) || CHAT_NAME_RE.test(v));

// Servidor exacto, https, sin puerto, credenciales, consulta ni fragmento, y ruta /services/…
export function validSlackWebhookUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 300) return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.hostname !== "hooks.slack.com") return false;
  if (u.port !== "" || u.username !== "" || u.password !== "" || u.search !== "" || u.hash !== "") return false;
  if (!SLACK_PATH_RE.test(u.pathname)) return false;
  // La cadena original debe ser exactamente servidor + ruta: no admite nada más (barras, "?" vacío, etc.).
  return v === SLACK_ORIGIN + u.pathname;
}

// ---------- transporte HTTP ----------

type Posted = { kind: "failed"; code: string } | { kind: "response"; status: number; json: unknown; retryAfterHeader: string | null };

// Lee como máximo MAX_RESPONSE_BYTES; si la lectura falla o no hay cuerpo, devuelve lo leído hasta entonces.
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_RESPONSE_BYTES) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      chunks.push(chunk.value);
    }
  } catch {
    // Se ignora: solo importa el estado HTTP.
  }
  try {
    await reader.cancel();
  } catch {
    // Nada que hacer.
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks).subarray(0, MAX_RESPONSE_BYTES));
}

async function postJson(deps: NotifyDeps, url: string, body: unknown): Promise<Posted> {
  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
  } catch (err) {
    return { kind: "failed", code: errName(err) };
  }
  const text = await readCapped(res);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { kind: "response", status: res.status, json, retryAfterHeader: res.headers.get("retry-after") };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Segundos pedidos por Telegram (parameters.retry_after) o por la cabecera Retry-After.
function retryWaitMs(posted: Extract<Posted, { kind: "response" }>, fromBody: boolean): number {
  let seconds = 1;
  const params = fromBody && isObj(posted.json) && isObj(posted.json["parameters"]) ? posted.json["parameters"] : undefined;
  const asked = params?.["retry_after"];
  if (typeof asked === "number" && Number.isFinite(asked) && asked >= 0) seconds = asked;
  else if (posted.retryAfterHeader !== null && /^\d{1,5}$/.test(posted.retryAfterHeader.trim())) seconds = Number(posted.retryAfterHeader.trim());
  return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS);
}

type Sender = (deps: NotifyDeps, text: string) => Promise<Posted>;

// Envía los mensajes en orden, con la separación indicada. Un 429 se espera una sola vez en todo el canal y
// se reintenta ese mensaje; cualquier otro fallo, o un segundo 429, abandona el canal.
async function sendSequence(
  deps: NotifyDeps,
  channel: ChannelName,
  messages: string[],
  spacingMs: number,
  post: Sender,
  success: (p: Extract<Posted, { kind: "response" }>) => boolean,
  retryFromBody: boolean,
): Promise<NotifyResult> {
  let sent = 0;
  let retried = false;
  for (let i = 0; i < messages.length; i++) {
    if (i > 0) await deps.sleep(spacingMs);
    for (;;) {
      const posted = await post(deps, messages[i]!);
      if (posted.kind === "failed") return { channel, ok: false, sent, code: posted.code };
      if (success(posted)) break;
      if (posted.status === 429 && !retried) {
        retried = true;
        await deps.sleep(retryWaitMs(posted, retryFromBody));
        continue;
      }
      return { channel, ok: false, sent, code: posted.status === 200 ? "respuesta" : `http-${posted.status}` };
    }
    sent++;
  }
  return { channel, ok: true, sent };
}

// ---------- canales ----------

async function sendEmail(digest: Digest, to: string, deps: NotifyDeps): Promise<NotifyResult> {
  if (!validEmail(to)) return { channel: "email", ok: false, sent: 0, code: "config" };
  try {
    const run = await deps.callActor(
      SEND_MAIL_ACTOR,
      { to, subject: digest.subject, text: digest.text, html: digest.html },
      // log: null evita que el SDK copie el registro de send-mail (con la dirección y el resumen) en el de NormaWatch.
      { memory: SEND_MAIL_MEMORY_MB, timeout: SEND_MAIL_TIMEOUT_SECS, log: null },
    );
    if (run.status === "SUCCEEDED") return { channel: "email", ok: true, sent: 1 };
    return { channel: "email", ok: false, sent: 0, code: /^[A-Z_-]{1,20}$/.test(run.status) ? run.status : "desconocido" };
  } catch (err) {
    return { channel: "email", ok: false, sent: 0, code: errName(err) };
  }
}

async function sendTelegram(digest: Digest, cfg: { botToken: string; chatId: string }, deps: NotifyDeps): Promise<NotifyResult> {
  if (!validTelegramToken(cfg.botToken) || !validTelegramChatId(cfg.chatId)) return { channel: "telegram", ok: false, sent: 0, code: "config" };
  const url = `https://${TELEGRAM_HOST}/bot${cfg.botToken}/sendMessage`;
  // Los grupos y canales (identificador negativo o @nombre) admiten 20 mensajes por minuto.
  const group = cfg.chatId.startsWith("-") || cfg.chatId.startsWith("@");
  const post: Sender = (d, text) =>
    postJson(d, url, { chat_id: cfg.chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  const ok = (p: Extract<Posted, { kind: "response" }>): boolean => p.status === 200 && isObj(p.json) && p.json["ok"] === true;
  return sendSequence(deps, "telegram", digest.chunks(TELEGRAM_MAX_CHARS, "telegram", MAX_MESSAGES), group ? TELEGRAM_GROUP_SPACING_MS : SPACING_MS, post, ok, true);
}

async function sendSlack(digest: Digest, webhookUrl: string, deps: NotifyDeps): Promise<NotifyResult> {
  if (!validSlackWebhookUrl(webhookUrl)) return { channel: "slack", ok: false, sent: 0, code: "config" };
  const post: Sender = (d, text) => postJson(d, webhookUrl, { text });
  return sendSequence(deps, "slack", digest.chunks(SLACK_MAX_CHARS, "slack", MAX_MESSAGES), SPACING_MS, post, (p) => p.status === 200, false);
}

// ---------- orquestación ----------

export async function notify(digest: Digest, channels: Channels, deps: NotifyDeps): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  if (channels.email !== undefined) results.push(await sendEmail(digest, channels.email, deps));
  if (channels.telegram !== undefined) results.push(await sendTelegram(digest, channels.telegram, deps));
  if (channels.slackWebhookUrl !== undefined) results.push(await sendSlack(digest, channels.slackWebhookUrl, deps));
  for (const r of results) {
    if (r.ok) deps.log.info("Aviso enviado", { channel: r.channel, messages: r.sent });
    else deps.log.error("Aviso fallido", { channel: r.channel, sent: r.sent, code: r.code ?? "desconocido" });
  }
  return results;
}

const LABEL: Record<ChannelName, string> = { email: "Correo", telegram: "Telegram", slack: "Slack" };

// Mensaje de estado de la ejecución: un resultado por canal, sin direcciones, identificadores ni secretos.
export function formatStatus(results: NotifyResult[]): string {
  return results
    .map((r) => {
      if (r.channel === "email") return r.ok ? "Correo: resumen enviado" : `Correo: resumen no enviado (código ${r.code ?? "desconocido"})`;
      if (r.ok) return `${LABEL[r.channel]}: ${r.sent} ${r.sent === 1 ? "mensaje" : "mensajes"}`;
      return `${LABEL[r.channel]}: error ${r.code ?? "desconocido"}`;
    })
    .join("; ");
}

export function createNotifier(plan: NotifyPlan, deps: NotifyDeps, ctx: DigestOptions): Notifier {
  return {
    whenEmpty: plan.whenEmpty,
    send: async (items) => {
      const results = await notify(buildDigest(items, ctx), plan.channels, deps);
      return { ok: results.every((r) => r.ok), statusMessage: formatStatus(results), results };
    },
  };
}
