// Registro de las fuentes. Cada boletín tiene su adaptador; el ejecutor solo conoce esta interfaz.
import { boe } from "./boe.ts";
import { boja } from "./boja.ts";
import { dog } from "./dog.ts";
import type { Bulletin } from "./ids.ts";
import type { SourceAdapter } from "./types.ts";

export { BULLETINS, isBulletin } from "./ids.ts";
export type { Bulletin } from "./ids.ts";
export type { SourceAdapter } from "./types.ts";

const ADAPTERS: Record<Bulletin, SourceAdapter> = { BOE: boe, BOJA: boja, DOG: dog };

export function adapterFor(bulletin: Bulletin): SourceAdapter {
  return ADAPTERS[bulletin];
}
