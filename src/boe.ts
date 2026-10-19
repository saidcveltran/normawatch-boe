// Bucle de ejecución del Actor. Solo biblioteca estándar. El cliente HTTP está en http.ts y se
// reexporta aquí para que el resto del código tenga un único punto de entrada.
import { BoeError, errName } from "./errors.ts";
import { BASE_URL, MAX_BYTES, RateLimitError, TIMEOUT_MS, USER_AGENT, buildSumarioUrl, fetchSumario } from "./http.ts";

// Días seguidos acabados en 429/5xx tras los que se detiene la ejecución.
const MAX_RATE_LIMITED_DAYS = 2;
import type { FetchOptions, FetchResult } from "./http.ts";
import { dropMessages, parseSumario } from "./parse.ts";
import type { OutputItem } from "./parse.ts";
import { madridToday, matchesFilters, parseInput } from "./input.ts";
import type { RunInput } from "./input.ts";

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
};

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
  let rateLimitedStreak = 0;
  for (let i = 0; i < input.dates.length && summary.stored < input.maxItems; i++) {
    const date = input.dates[i]!;
    if (i > 0) await deps.sleep(input.requestDelayMs);
    try {
      const result = await deps.fetchDay(date);
      summary.requests += result.requests;
      if (result.status === "empty") {
        rateLimitedStreak = 0;
        deps.log.info("Sin BOE este día", { date });
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
        // Solo se marcan como vistos los elementos realmente entregados.
        // Si no se puede guardar, lo ya entregado se conserva y se cuenta; la ejecución acaba con error.
        if (seen) {
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
      summary.stored += room.length;
      for (const message of dropMessages(dropped)) deps.log.info(message, { date });
      deps.log.info("Día completado", {
        date,
        found: matching.length,
        repeated: matching.length - candidates.length,
        stored: room.length,
        ...dropped,
      });
    } catch (err) {
      if (err instanceof BoeError) {
        summary.failedDays++;
        summary.failedDates.push(date);
        deps.log.error("Día fallido", { date, reason: err.message });
        rateLimitedStreak = err instanceof RateLimitError ? rateLimitedStreak + 1 : 0;
        if (rateLimitedStreak >= MAX_RATE_LIMITED_DAYS) {
          deps.log.error("Se detiene la ejecución: el BOE responde con límite de peticiones o error del servidor en días seguidos", {
            days: rateLimitedStreak,
          });
          summary.exitCode = 1;
          return summary;
        }
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
  return summary;
}
