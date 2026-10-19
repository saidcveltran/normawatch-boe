import { Actor, log } from "apify";
import { BoeError, errName, fetchSumario, madridToday, parseInput, runDays } from "./boe.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

await Actor.init();
let exitCode = 0;
try {
  const raw = (await Actor.getInput<Record<string, unknown>>()) ?? {};
  const input = parseInput(raw, madridToday());
  const summary = await runDays(input, {
    fetchDay: (date) => fetchSumario(date),
    push: (items) => Actor.pushData(items),
    sleep,
    now: () => new Date().toISOString(),
    log: {
      info: (message, data) => log.info(message, data),
      error: (message, data) => log.error(message, data),
    },
  });
  exitCode = summary.exitCode;
} catch (err) {
  if (err instanceof BoeError) {
    log.error("Invalid input", { reason: err.message });
    exitCode = 2;
  } else {
    log.error("Unexpected error", { name: errName(err) });
    exitCode = 1;
  }
} finally {
  await Actor.exit({ exitCode });
}
