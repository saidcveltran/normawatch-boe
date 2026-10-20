import { Actor, log } from "apify";
import { BoeError, errName, madridToday, parseInput, runDays } from "./boe.ts";
import { adapterFor, isBulletin } from "./sources/index.ts";
import { parseNotifyInput } from "./input.ts";
import { createNotifier } from "./notify.ts";
import type { NotifyDeps } from "./notify.ts";
import type { OutputItem } from "./parse.ts";
import { fetchRelationsDocument } from "./relations.ts";
import { SEEN_STORE_NAME, SeenStore, seenKey } from "./seen.ts";

const STATE_KEY = "STATE";
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
  // Con más de 31 días las fechas van de la más reciente a la más antigua: el rango se toma por mínimo y máximo.
  const sortedDates = [...input.dates].sort();
  const notifier = hasChannels
    ? createNotifier(plan, noticeDeps, {
        dateFrom: sortedDates[0]!,
        dateTo: sortedDates[sortedDates.length - 1]!,
        ...(input.bulletins !== undefined ? { bulletins: input.bulletins } : {}),
        ...(datasetId ? { datasetUrl: `https://console.apify.com/storage/datasets/${datasetId}` } : {}),
      })
    : undefined;
  // Punto de control en el almacén clave-valor de la ejecución (clave STATE): sobrevive a migraciones y reinicios.
  // Se guarda tras cada día, así que ante una migración ya está al día y la ejecución continúa en el nuevo contenedor.
  const runStore = await Actor.openKeyValueStore();
  Actor.on("migrating", () => {
    log.info("Migración en curso: el punto de control (STATE) ya está guardado y la ejecución se reanudará desde él");
  });
  const memo = new Map<string, unknown>();
  const summary = await runDays(input, {
    checkpoint: {
      load: () => runStore.getValue(STATE_KEY),
      save: (state) => runStore.setValue(STATE_KEY, state),
      clear: () => runStore.setValue(STATE_KEY, null),
      loadDelivered: async () => {
        const dataset = await Actor.openDataset();
        const out: OutputItem[] = [];
        const page = 1000;
        for (let offset = 0; ; offset += page) {
          const { items } = await dataset.getData({ offset, limit: page });
          for (const it of items) if (typeof (it as { id?: unknown }).id === "string") out.push(it as OutputItem);
          if (items.length < page) break;
        }
        return out;
      },
    },
    // memo: el DOG sirve siempre el mismo RSS, que se pide una sola vez por ejecución.
    fetchDay: (date, bulletin) => adapterFor(bulletin !== undefined && isBulletin(bulletin) ? bulletin : "BOE").fetchDay(date, { requestDelayMs: input.requestDelayMs, memo }),
    fetchRelations: (id) => fetchRelationsDocument(id, { requestDelayMs: input.requestDelayMs }),
    push: (items) => Actor.pushData(items),
    sleep,
    now: () => new Date().toISOString(),
    log: {
      info: (message, data) => log.info(message, data),
      error: (message, data) => log.error(message, data),
      warn: (message, data) => log.warning(message, data),
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
