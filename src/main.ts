import { Actor, log } from "apify";
import { BoeError, errName, fetchSumario, madridToday, parseInput, runDays } from "./boe.ts";
import { SEEN_STORE_NAME, SeenStore, seenKey } from "./seen.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

await Actor.init();
let exitCode = 0;
try {
  const raw = (await Actor.getInput<Record<string, unknown>>()) ?? {};
  const input = parseInput(raw, madridToday());
  // El almacén con nombre SEEN solo se abre si se pide onlyNew; sobrevive entre ejecuciones.
  let seen: SeenStore | undefined;
  if (input.onlyNew === true) {
    const store = await Actor.openKeyValueStore(SEEN_STORE_NAME);
    // Un registro por cada combinación de departamentos y palabras clave.
    const key = seenKey(input);
    seen = await SeenStore.open(
      {
        read: () => store.getValue(key),
        write: (ids) => store.setValue(key, ids),
      },
      undefined,
      (message) => log.warning(message),
    );
  }
  const summary = await runDays(input, {
    fetchDay: (date) => fetchSumario(date, { requestDelayMs: input.requestDelayMs }),
    push: (items) => Actor.pushData(items),
    sleep,
    now: () => new Date().toISOString(),
    log: {
      info: (message, data) => log.info(message, data),
      error: (message, data) => log.error(message, data),
    },
    ...(seen ? { seen } : {}),
  });
  exitCode = summary.exitCode;
} catch (err) {
  if (err instanceof BoeError) {
    log.error("Entrada no válida", { reason: err.message });
    exitCode = 2;
  } else {
    log.error("Error inesperado", { name: errName(err) });
    exitCode = 1;
  }
} finally {
  await Actor.exit({ exitCode });
}
