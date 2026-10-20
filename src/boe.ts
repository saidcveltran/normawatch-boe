// Bucle de ejecución del Actor. Solo biblioteca estándar. El cliente HTTP común está en http.ts, cada boletín en
// sources/*.ts, y todo se reexporta aquí para que el resto del código tenga un único punto de entrada.
import { createHash } from "node:crypto";
import { BoeError, errName } from "./errors.ts";
import { MAX_BYTES, RateLimitError, TIMEOUT_MS, USER_AGENT } from "./http.ts";
import { BASE_URL, buildSumarioUrl, fetchSumario } from "./sources/boe.ts";

// Días seguidos acabados en 429/5xx tras los que se detiene la ejecución (o la lectura de esa fuente).
const MAX_RATE_LIMITED_DAYS = 2;
// Cortacircuitos: días seguidos fallidos (tras los reintentos) tras los que se detiene la ejecución (o la lectura
// de esa fuente). Un día sin boletín (404 en el BOE) no cuenta como fallo.
export const MAX_CONSECUTIVE_FAILED_DAYS = 5;
import type { FetchOptions, FetchResult } from "./http.ts";
import { dropMessages } from "./parse.ts";
import type { OutputItem } from "./parse.ts";
import { madridToday, matchesFilters, parseInput } from "./input.ts";
import type { RunInput } from "./input.ts";
import type { Notifier } from "./notify.ts";
import { adapterFor } from "./sources/index.ts";
import type { Bulletin } from "./sources/index.ts";

export { BoeError, errName, madridToday, parseInput };
export { BASE_URL, MAX_BYTES, TIMEOUT_MS, USER_AGENT, buildSumarioUrl, fetchSumario };
export type { RunInput, FetchOptions, FetchResult };

// Con varias fuentes, una excepción que no es BoeError se convierte en el fallo de esa fuente ese día, para que
// una fuente rota nunca detenga a las demás. Con el BOE solo no cambia nada (código de salida 1, como en la 1.4).
async function guardSource<T>(multi: boolean, f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (err) {
    if (!multi || err instanceof BoeError) throw err;
    throw new BoeError(`error inesperado del adaptador (${errName(err)})`);
  }
}

export type RunDeps = {
  // El segundo argumento solo se pasa cuando la entrada elige boletines distintos del BOE solo.
  fetchDay: (date: string, bulletin?: string) => Promise<FetchResult>;
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

// Estado de una fuente cuando hay varias (rachas, cortacircuitos y días fallidos propios).
export type SourceState = {
  failStreak: number;
  rateLimitedStreak: number;
  stopped: boolean;
  failedDates: string[];
};

// Punto de control. nextDate es la siguiente fecha por pedir (null si ya no queda ninguna); delivered, los
// elementos entregados hasta ahora. El resto permite que, tras reanudar, el recuento de peticiones, los días
// fallidos y las rachas sigan siendo los de la ejecución completa. Con varios boletines, nextBulletin es la
// siguiente fuente de nextDate y sources guarda el estado de cada una; con el BOE solo, ninguno de los dos existe.
export type RunState = {
  // Huella de lo que define la ejecución (fechas, filtros, onlyNew, maxItems, boletines); un STATE con otra huella se ignora.
  fingerprint: string;
  nextDate: string | null;
  nextBulletin?: string;
  delivered: number;
  requests: number;
  failedDates: string[];
  failStreak: number;
  rateLimitedStreak: number;
  sources?: Record<string, SourceState>;
};

// Huella de la entrada relevante para reanudar. No incluye secretos (canales de aviso) ni la pausa entre peticiones.
export function inputFingerprint(input: RunInput): string {
  // Las secciones y los boletines entran solo cuando no son los habituales, para que un STATE de 1.3 o 1.4 siga valiendo.
  const canonical = JSON.stringify({
    dates: input.dates,
    maxItems: input.maxItems,
    onlyNew: input.onlyNew === true,
    departments: input.departments ?? [],
    keywords: input.keywords ?? [],
    normTypes: input.normTypes ?? [],
    ...(input.sections !== undefined ? { sections: input.sections } : {}),
    ...(input.bulletins !== undefined ? { bulletins: input.bulletins } : {}),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function readState(raw: unknown, dates: string[], bulletins: readonly string[], multi: boolean, fingerprint: string): RunState | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r["fingerprint"] !== fingerprint) return undefined;
  const count = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
  let nextDate: string | null;
  if (r["nextDate"] === null) nextDate = null;
  else if (typeof r["nextDate"] === "string" && dates.includes(r["nextDate"])) nextDate = r["nextDate"];
  else return undefined;
  const validDates = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((d): d is string => typeof d === "string" && dates.includes(d)) : [];
  const base = {
    fingerprint,
    nextDate,
    delivered: count(r["delivered"]),
    requests: count(r["requests"]),
    failedDates: validDates(r["failedDates"]),
    failStreak: count(r["failStreak"]),
    rateLimitedStreak: count(r["rateLimitedStreak"]),
  };
  if (!multi) return base;
  let nextBulletin: string | undefined;
  if (nextDate !== null) {
    nextBulletin = typeof r["nextBulletin"] === "string" ? r["nextBulletin"] : bulletins[0];
    if (nextBulletin === undefined || !bulletins.includes(nextBulletin)) return undefined;
  }
  const rawSources = typeof r["sources"] === "object" && r["sources"] !== null ? (r["sources"] as Record<string, unknown>) : {};
  const sources: Record<string, SourceState> = {};
  for (const b of bulletins) {
    const s = rawSources[b];
    const o = typeof s === "object" && s !== null ? (s as Record<string, unknown>) : {};
    sources[b] = {
      failStreak: count(o["failStreak"]),
      rateLimitedStreak: count(o["rateLimitedStreak"]),
      stopped: o["stopped"] === true,
      failedDates: validDates(o["failedDates"]),
    };
  }
  return { ...base, ...(nextBulletin !== undefined ? { nextBulletin } : {}), sources };
}

export type RunSummary = {
  exitCode: number;
  requests: number;
  stored: number;
  failedDays: number;
  // Con el BOE solo, las fechas; con varios boletines, «BOLETÍN:fecha».
  failedDates: string[];
};

// Un BoeError solo hace fallar su día y su fuente; cualquier otro error es inesperado: se registra su nombre,
// se detiene la ejecución y el código de salida es 1. El registro lleva solo recuentos, fechas y
// estados, nunca texto de títulos. Con varios boletines el orden es día a día y, dentro de cada día, el de la entrada;
// la ejecución termina con 1 solo si todas las fuentes elegidas han fallado.
export async function runDays(input: RunInput, deps: RunDeps): Promise<RunSummary> {
  const summary: RunSummary = { exitCode: 0, requests: 0, stored: 0, failedDays: 0, failedDates: [] };
  const seen = input.onlyNew === true ? deps.seen : undefined;
  const multi = input.bulletins !== undefined;
  const bulletins = (input.bulletins ?? ["BOE"]) as Bulletin[];
  const B = bulletins.length;
  const total = input.dates.length * B;
  const src = new Map<string, SourceState>(bulletins.map((b) => [b, { failStreak: 0, rateLimitedStreak: 0, stopped: false, failedDates: [] }]));
  // Identificadores entregados en esta ejecución: un mismo identificador se entrega una sola vez.
  const delivered = new Set<string>();
  // Con avisador, los elementos entregados y los identificadores pendientes de marcar como vistos.
  const notifier = deps.notifier;
  const deliveredItems: OutputItem[] = [];
  const pendingIds: string[] = [];
  let start = 0;
  // Reanudación: si hay un STATE que corresponde a esta entrada, se continúa desde la fecha (y la fuente) guardada.
  // Los elementos ya entregados se leen del conjunto de datos (la fuente de verdad: incluye lo entregado entre
  // el último punto de control y la interrupción), de modo que no se repiten ni se pierden para el aviso ni para SEEN.
  const cp = deps.checkpoint;
  const fingerprint = inputFingerprint(input);
  let resumedIds: string[] = [];
  if (cp) {
    let state: RunState | undefined;
    try {
      state = readState(await cp.load(), input.dates, bulletins, multi, fingerprint);
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
        if (multi && state.sources) {
          for (const b of bulletins) {
            const s = state.sources[b]!;
            src.set(b, { ...s, failedDates: [...s.failedDates] });
            for (const d of s.failedDates) summary.failedDates.push(`${b}:${d}`);
          }
          summary.failedDays = summary.failedDates.length;
          start =
            state.nextDate === null
              ? total
              : input.dates.indexOf(state.nextDate) * B + Math.max(0, bulletins.indexOf((state.nextBulletin ?? bulletins[0]) as Bulletin));
        } else {
          const only = src.get("BOE")!;
          only.failStreak = state.failStreak;
          only.rateLimitedStreak = state.rateLimitedStreak;
          summary.failedDates = [...state.failedDates];
          summary.failedDays = state.failedDates.length;
          only.failedDates = [...state.failedDates];
          start = state.nextDate === null ? total : input.dates.indexOf(state.nextDate);
        }
        deps.log.info("Se reanuda la ejecución desde STATE", { nextDate: state.nextDate, delivered: previous.length, requests: state.requests });
      } catch (err) {
        deps.log.error("No se pudo leer lo ya entregado: se empieza desde el principio", { name: errName(err) });
        delivered.clear();
        deliveredItems.length = 0;
        pendingIds.length = 0;
        resumedIds = [];
        summary.failedDates = [];
        summary.failedDays = 0;
        for (const b of bulletins) src.set(b, { failStreak: 0, rateLimitedStreak: 0, stopped: false, failedDates: [] });
        start = 0;
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
  // Guarda el punto de control tras cada tarea (día y fuente). Un fallo al guardarlo solo se registra: se pierde la
  // posibilidad de reanudar, no lo ya entregado.
  const checkpoint = async (nextTask: number): Promise<void> => {
    if (!cp) return;
    const nextDate = input.dates[Math.floor(nextTask / B)] ?? null;
    try {
      if (multi) {
        await cp.save({
          fingerprint,
          nextDate,
          ...(nextDate !== null ? { nextBulletin: bulletins[nextTask % B]! } : {}),
          delivered: summary.stored,
          requests: summary.requests,
          failedDates: [],
          failStreak: 0,
          rateLimitedStreak: 0,
          sources: Object.fromEntries(bulletins.map((b) => [b, { ...src.get(b)!, failedDates: [...src.get(b)!.failedDates] }])),
        });
      } else {
        const only = src.get("BOE")!;
        await cp.save({
          fingerprint,
          nextDate,
          delivered: summary.stored,
          requests: summary.requests,
          failedDates: summary.failedDates,
          failStreak: only.failStreak,
          rateLimitedStreak: only.rateLimitedStreak,
        });
      }
    } catch (err) {
      deps.log.error("No se pudo guardar STATE: la ejecución sigue, pero no podrá reanudarse", { name: errName(err) });
    }
  };
  let executed = false;
  for (let t = start; t < total && summary.stored < input.maxItems; t++) {
    const date = input.dates[Math.floor(t / B)]!;
    const bulletin = bulletins[t % B]!;
    const st = src.get(bulletin)!;
    if (st.stopped) continue;
    const tag: Record<string, unknown> = multi ? { bulletin } : {};
    if (executed) await deps.sleep(input.requestDelayMs);
    executed = true;
    try {
      // Con varias fuentes, cualquier excepción de un adaptador es el fallo de esa fuente ese día.
      const result = await guardSource(multi, () => (multi || bulletin !== "BOE" ? deps.fetchDay(date, bulletin) : deps.fetchDay(date)));
      summary.requests += result.requests;
      if (result.status === "empty") {
        st.rateLimitedStreak = 0;
        st.failStreak = 0;
        deps.log.info(`Sin ${bulletin} este día`, { date, ...tag });
        await checkpoint(t + 1);
        continue;
      }
      const parsed = await guardSource(multi, async () => adapterFor(bulletin).parseDay(result.body, date, deps.now(), input.sections));
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
              ...tag,
              name: errName(seenErr),
              delivered: room.length,
            });
            summary.exitCode = 1;
            return summary;
          }
        }
      }
      st.rateLimitedStreak = 0;
      st.failStreak = 0;
      summary.stored += room.length;
      for (const message of dropMessages(dropped, bulletin)) deps.log.info(message, { date, ...tag });
      deps.log.info("Día completado", {
        date,
        ...tag,
        found: matching.length,
        repeated: matching.length - candidates.length,
        stored: room.length,
        ...dropped,
      });
      await checkpoint(t + 1);
    } catch (err) {
      if (err instanceof BoeError) {
        summary.failedDays++;
        summary.failedDates.push(multi ? `${bulletin}:${date}` : date);
        st.failedDates.push(date);
        deps.log.error("Día fallido", { date, ...tag, reason: err.message });
        st.rateLimitedStreak = err instanceof RateLimitError ? st.rateLimitedStreak + 1 : 0;
        st.failStreak++;
        let tripped = false;
        if (st.rateLimitedStreak >= MAX_RATE_LIMITED_DAYS) {
          deps.log.error(
            multi
              ? `Se detiene la lectura del ${bulletin}: responde con límite de peticiones o error del servidor en días seguidos`
              : "Se detiene la ejecución: el BOE responde con límite de peticiones o error del servidor en días seguidos",
            { ...tag, days: st.rateLimitedStreak },
          );
          tripped = true;
        } else if (st.failStreak >= MAX_CONSECUTIVE_FAILED_DAYS) {
          deps.log.error(
            multi
              ? `Cortacircuitos: se detiene la lectura del ${bulletin} tras varios días seguidos fallidos`
              : "Cortacircuitos: se detiene la ejecución tras varios días seguidos fallidos",
            { ...tag, days: st.failStreak },
          );
          tripped = true;
        }
        if (tripped) {
          st.stopped = true;
          if (bulletins.every((b) => src.get(b)!.stopped)) {
            summary.exitCode = 1;
            await checkpoint(t + 1);
            return summary;
          }
        }
        await checkpoint(t + 1);
      } else {
        deps.log.error("Error inesperado", { date, ...tag, name: errName(err) });
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
  const everySourceFailed = bulletins.every((b) => {
    const s = src.get(b)!;
    return s.stopped || (s.failedDates.length > 0 && s.failedDates.length === input.dates.length);
  });
  if (summary.failedDays > 0 && everySourceFailed) summary.exitCode = 1;
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
