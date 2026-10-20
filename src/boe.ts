// Bucle de ejecución del Actor. Solo biblioteca estándar. El cliente HTTP está en http.ts y se
// reexporta aquí para que el resto del código tenga un único punto de entrada.
import { createHash } from "node:crypto";
import { BoeError, errName } from "./errors.ts";
import { BASE_URL, MAX_BYTES, RateLimitError, TIMEOUT_MS, USER_AGENT, buildSumarioUrl, fetchSumario } from "./http.ts";

// Días seguidos acabados en 429/5xx tras los que se detiene la ejecución.
const MAX_RATE_LIMITED_DAYS = 2;
// Cortacircuitos: días seguidos fallidos (tras los reintentos) tras los que se detiene la ejecución.
// Un día sin BOE (404) no cuenta como fallo.
export const MAX_CONSECUTIVE_FAILED_DAYS = 5;
import type { FetchOptions, FetchResult } from "./http.ts";
import { dropMessages, parseSumario } from "./parse.ts";
import type { OutputItem } from "./parse.ts";
import { madridToday, matchesFilters, parseInput } from "./input.ts";
import type { RunInput } from "./input.ts";
import type { Notifier } from "./notify.ts";

export { BoeError, errName, madridToday, parseInput };
export { BASE_URL, MAX_BYTES, TIMEOUT_MS, USER_AGENT, buildSumarioUrl, fetchSumario };
export type { RunInput, FetchOptions, FetchResult };

export type RunDeps = {
  fetchDay: (date: string) => Promise<FetchResult>;
  push: (items: OutputItem[]) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => string;
  log: {
    info: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
  };
  // Memoria de elementos ya entregados; solo se consulta y se actualiza si la entrada trae onlyNew.
  seen?: {
    has: (id: string) => boolean;
    add: (ids: string[]) => Promise<void>;
  };
  // Aviso opcional (correo, Telegram, Slack). Con avisador, SEEN se confirma al final y solo si el aviso salió bien.
  notifier?: Notifier;
  // Muestra el resultado de los avisos como mensaje de estado de la ejecución.
  setStatus?: (message: string) => Promise<void>;
  // Punto de control para reanudar tras una migración o un reinicio (almacén clave-valor, clave STATE).
  checkpoint?: {
    load: () => Promise<unknown>;
    save: (state: RunState) => Promise<void>;
    clear: () => Promise<void>;
    // Elementos ya entregados al conjunto de datos de esta ejecución, en el orden en que se entregaron.
    loadDelivered: () => Promise<OutputItem[]>;
  };
};

// Punto de control. nextDate es la siguiente fecha por pedir (null si ya no queda ninguna); delivered, los
// elementos entregados hasta ahora. El resto permite que, tras reanudar, el recuento de peticiones, los días
// fallidos y las rachas sigan siendo los de la ejecución completa.
export type RunState = {
  // Huella de lo que define la ejecución (fechas, filtros, onlyNew, maxItems); un STATE con otra huella se ignora.
  fingerprint: string;
  nextDate: string | null;
  delivered: number;
  requests: number;
  failedDates: string[];
  failStreak: number;
  rateLimitedStreak: number;
};

// Huella de la entrada relevante para reanudar. No incluye secretos (canales de aviso) ni la pausa entre peticiones.
export function inputFingerprint(input: RunInput): string {
  const canonical = JSON.stringify({
    dates: input.dates,
    maxItems: input.maxItems,
    onlyNew: input.onlyNew === true,
    departments: input.departments ?? [],
    keywords: input.keywords ?? [],
    normTypes: input.normTypes ?? [],
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function readState(raw: unknown, dates: string[], fingerprint: string): RunState | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r["fingerprint"] !== fingerprint) return undefined;
  const count = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
  let nextDate: string | null;
  if (r["nextDate"] === null) nextDate = null;
  else if (typeof r["nextDate"] === "string" && dates.includes(r["nextDate"])) nextDate = r["nextDate"];
  else return undefined;
  const failedDates = Array.isArray(r["failedDates"])
    ? r["failedDates"].filter((d): d is string => typeof d === "string" && dates.includes(d))
    : [];
  return {
    fingerprint,
    nextDate,
    delivered: count(r["delivered"]),
    requests: count(r["requests"]),
    failedDates,
    failStreak: count(r["failStreak"]),
    rateLimitedStreak: count(r["rateLimitedStreak"]),
  };
}

export type RunSummary = {
  exitCode: number;
  requests: number;
  stored: number;
  failedDays: number;
  failedDates: string[];
};

// Un BoeError solo hace fallar su día; cualquier otro error es inesperado: se registra su nombre,
// se detiene la ejecución y el código de salida es 1. El registro lleva solo recuentos, fechas y
// estados, nunca texto de títulos.
export async function runDays(input: RunInput, deps: RunDeps): Promise<RunSummary> {
  const summary: RunSummary = { exitCode: 0, requests: 0, stored: 0, failedDays: 0, failedDates: [] };
  const seen = input.onlyNew === true ? deps.seen : undefined;
  // Identificadores entregados en esta ejecución: un mismo identificador se entrega una sola vez.
  const delivered = new Set<string>();
  // Con avisador, los elementos entregados y los identificadores pendientes de marcar como vistos.
  const notifier = deps.notifier;
  const deliveredItems: OutputItem[] = [];
  const pendingIds: string[] = [];
  let rateLimitedStreak = 0;
  let failStreak = 0;
  let start = 0;
  // Reanudación: si hay un STATE que corresponde a esta entrada, se continúa desde la fecha guardada.
  // Los elementos ya entregados se leen del conjunto de datos (la fuente de verdad: incluye lo entregado entre
  // el último punto de control y la interrupción), de modo que no se repiten ni se pierden para el aviso ni para SEEN.
  const cp = deps.checkpoint;
  const fingerprint = inputFingerprint(input);
  let resumedIds: string[] = [];
  if (cp) {
    let state: RunState | undefined;
    try {
      state = readState(await cp.load(), input.dates, fingerprint);
    } catch (err) {
      deps.log.error("No se pudo leer STATE: se empieza desde el principio", { name: errName(err) });
    }
    if (state) {
      try {
        const previous = await cp.loadDelivered();
        resumedIds = previous.map((it) => it.id);
        for (const it of previous) {
          if (delivered.has(it.id)) continue;
          delivered.add(it.id);
          if (notifier) {
            deliveredItems.push(it);
            pendingIds.push(it.id);
          }
        }
        summary.stored = Math.min(previous.length, input.maxItems);
        summary.requests = state.requests;
        summary.failedDates = [...state.failedDates];
        summary.failedDays = state.failedDates.length;
        failStreak = state.failStreak;
        rateLimitedStreak = state.rateLimitedStreak;
        start = state.nextDate === null ? input.dates.length : input.dates.indexOf(state.nextDate);
        deps.log.info("Se reanuda la ejecución desde STATE", { nextDate: state.nextDate, delivered: previous.length, requests: state.requests });
      } catch (err) {
        deps.log.error("No se pudo leer lo ya entregado: se empieza desde el principio", { name: errName(err) });
        delivered.clear();
        deliveredItems.length = 0;
        pendingIds.length = 0;
        resumedIds = [];
      }
    }
  }
  // Sin avisador, SEEN se confirma por día; si el proceso murió entre pushData y seen.add, lo entregado antes de
  // reanudar podría faltar en SEEN y repetirse al día siguiente. Se añade una vez al reanudar.
  if (seen && !notifier && resumedIds.length > 0) {
    try {
      await seen.add(resumedIds);
    } catch (seenErr) {
      deps.log.error("No se pudo guardar SEEN: lo ya entregado se conserva, pero podría repetirse en la próxima ejecución", {
        name: errName(seenErr),
        delivered: resumedIds.length,
      });
      summary.exitCode = 1;
      return summary;
    }
  }
  // Guarda el punto de control tras cada día. Un fallo al guardarlo solo se registra: se pierde la posibilidad
  // de reanudar, no lo ya entregado.
  const checkpoint = async (nextIndex: number): Promise<void> => {
    if (!cp) return;
    try {
      await cp.save({
        fingerprint,
        nextDate: input.dates[nextIndex] ?? null,
        delivered: summary.stored,
        requests: summary.requests,
        failedDates: summary.failedDates,
        failStreak,
        rateLimitedStreak,
      });
    } catch (err) {
      deps.log.error("No se pudo guardar STATE: la ejecución sigue, pero no podrá reanudarse", { name: errName(err) });
    }
  };
  for (let i = start; i < input.dates.length && summary.stored < input.maxItems; i++) {
    const date = input.dates[i]!;
    if (i > start) await deps.sleep(input.requestDelayMs);
    try {
      const result = await deps.fetchDay(date);
      summary.requests += result.requests;
      if (result.status === "empty") {
        rateLimitedStreak = 0;
        failStreak = 0;
        deps.log.info("Sin BOE este día", { date });
        await checkpoint(i + 1);
        continue;
      }
      const parsed = parseSumario(result.body, date, deps.now());
      const { dropped } = parsed;
      const matching = parsed.items.filter((it) => matchesFilters(it, input));
      const candidates: OutputItem[] = [];
      const inDay = new Set<string>();
      for (const it of matching) {
        if (delivered.has(it.id) || inDay.has(it.id) || seen?.has(it.id) === true) continue;
        inDay.add(it.id);
        candidates.push(it);
      }
      const room = candidates.slice(0, input.maxItems - summary.stored);
      if (room.length > 0) {
        await deps.push(room);
        for (const it of room) delivered.add(it.id);
        if (notifier) {
          deliveredItems.push(...room);
          for (const it of room) pendingIds.push(it.id);
        }
        // Solo se marcan como vistos los elementos realmente entregados.
        // Si no se puede guardar, lo ya entregado se conserva y se cuenta; la ejecución acaba con error.
        if (seen && !notifier) {
          try {
            await seen.add(room.map((it) => it.id));
          } catch (seenErr) {
            summary.stored += room.length;
            deps.log.error("No se pudo guardar SEEN: lo ya entregado se conserva, pero podría repetirse en la próxima ejecución", {
              date,
              name: errName(seenErr),
              delivered: room.length,
            });
            summary.exitCode = 1;
            return summary;
          }
        }
      }
      rateLimitedStreak = 0;
      failStreak = 0;
      summary.stored += room.length;
      for (const message of dropMessages(dropped)) deps.log.info(message, { date });
      deps.log.info("Día completado", {
        date,
        found: matching.length,
        repeated: matching.length - candidates.length,
        stored: room.length,
        ...dropped,
      });
      await checkpoint(i + 1);
    } catch (err) {
      if (err instanceof BoeError) {
        summary.failedDays++;
        summary.failedDates.push(date);
        deps.log.error("Día fallido", { date, reason: err.message });
        rateLimitedStreak = err instanceof RateLimitError ? rateLimitedStreak + 1 : 0;
        failStreak++;
        if (rateLimitedStreak >= MAX_RATE_LIMITED_DAYS) {
          deps.log.error("Se detiene la ejecución: el BOE responde con límite de peticiones o error del servidor en días seguidos", {
            days: rateLimitedStreak,
          });
          summary.exitCode = 1;
          await checkpoint(i + 1);
          return summary;
        }
        if (failStreak >= MAX_CONSECUTIVE_FAILED_DAYS) {
          deps.log.error("Cortacircuitos: se detiene la ejecución tras varios días seguidos fallidos", { days: failStreak });
          summary.exitCode = 1;
          await checkpoint(i + 1);
          return summary;
        }
        await checkpoint(i + 1);
      } else {
        deps.log.error("Error inesperado", { date, name: errName(err) });
        summary.exitCode = 1;
        return summary;
      }
    }
  }
  if (summary.stored >= input.maxItems) deps.log.info("Alcanzado maxItems", { maxItems: input.maxItems });
  deps.log.info("Ejecución terminada", {
    days: input.dates.length,
    requests: summary.requests,
    stored: summary.stored,
    failedDays: summary.failedDays,
  });
  if (summary.failedDays > 0 && summary.failedDays === input.dates.length) summary.exitCode = 1;
  if (notifier && summary.exitCode === 0) await finishWithNotice(notifier, deliveredItems, pendingIds, seen, summary, deps);
  // Terminada bien (y avisada, si procede), STATE ya no hace falta. Si acaba con error se conserva, para poder reanudar.
  if (cp && summary.exitCode === 0) {
    try {
      await cp.clear();
    } catch (err) {
      deps.log.error("No se pudo borrar STATE", { name: errName(err) });
    }
  }
  return summary;
}

// Aviso final. SEEN se confirma solo si todos los canales funcionaron; si no, los elementos se repetirán en la
// próxima ejecución (el conjunto de datos de esta ya los tiene) y la ejecución termina con código 3.
// Los errores se registran solo por su nombre: nunca su mensaje, que podría arrastrar un secreto.
async function finishWithNotice(
  notifier: Notifier,
  items: OutputItem[],
  pendingIds: string[],
  seen: RunDeps["seen"],
  summary: RunSummary,
  deps: RunDeps,
): Promise<void> {
  if (items.length === 0 && !notifier.whenEmpty) {
    deps.log.info("Sin elementos nuevos: no se envía el aviso", {});
    return;
  }
  let ok = false;
  let statusMessage = "Aviso no enviado";
  try {
    const report = await notifier.send(items);
    ok = report.ok;
    statusMessage = report.statusMessage;
  } catch (err) {
    deps.log.error("El aviso falló con un error inesperado", { name: errName(err) });
  }
  try {
    await deps.setStatus?.(statusMessage);
  } catch (err) {
    deps.log.error("No se pudo actualizar el mensaje de estado", { name: errName(err) });
  }
  if (!ok) {
    deps.log.error("El aviso no se envió: los elementos se repetirán en la próxima ejecución", { delivered: items.length });
    summary.exitCode = 3;
    return;
  }
  if (seen && pendingIds.length > 0) {
    try {
      await seen.add(pendingIds);
    } catch (seenErr) {
      deps.log.error("No se pudo guardar SEEN: lo ya entregado se conserva, pero podría repetirse en la próxima ejecución", {
        name: errName(seenErr),
        delivered: pendingIds.length,
      });
      summary.exitCode = 1;
    }
  }
}
