import { Actor, log } from "apify";
import { BoeError, errName, fetchSumario, madridToday, parseInput, runDays } from "./boe.ts";
import { parseNotifyInput } from "./input.ts";
import { createNotifier } from "./notify.ts";
import type { NotifyDeps } from "./notify.ts";
import { SEEN_STORE_NAME, SeenStore, seenKey } from "./seen.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

await Actor.init();
let exitCode = 0;
try {
  const raw = (await Actor.getInput<Record<string, unknown>>()) ?? {};
  const input = parseInput(raw, madridToday());
  // Los avisos se validan antes de hacer ninguna petición; sus valores son secretos y nunca se registran.
  const plan = parseNotifyInput(raw);
  const hasChannels = plan.channels.email !== undefined || plan.channels.telegram !== undefined || plan.channels.slackWebhookUrl !== undefined;
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
  const noticeDeps: NotifyDeps = {
    callActor: (actorId, actorInput, options) => Actor.call(actorId, actorInput, options),
    fetch,
    sleep,
    log: {
      info: (message, data) => log.info(message, data),
      error: (message, data) => log.error(message, data),
    },
  };
  const datasetId = Actor.getEnv().defaultDatasetId;
  const notifier = hasChannels
    ? createNotifier(plan, noticeDeps, {
        dateFrom: input.dates[0]!,
        dateTo: input.dates[input.dates.length - 1]!,
        ...(datasetId ? { datasetUrl: `https://console.apify.com/storage/datasets/${datasetId}` } : {}),
      })
    : undefined;
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
    ...(notifier ? { notifier, setStatus: async (message: string) => void (await Actor.setStatusMessage(message)) } : {}),
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
