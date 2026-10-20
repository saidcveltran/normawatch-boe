// Interfaz común de las fuentes (C3.4): una por boletín, con la misma forma de salida.
import type { FetchOptions, FetchResult } from "../http.ts";
import type { Dropped, OutputItem } from "../parse.ts";
import type { Bulletin } from "./ids.ts";

export type SourceAdapter = {
  id: Bulletin;
  // Pide el documento de un día (fecha ya validada). Un día sin boletín devuelve status "empty".
  fetchDay: (date: string, options: FetchOptions) => Promise<FetchResult>;
  // Convierte el documento en elementos de salida. sections solo lo usa el BOE (sección III opcional).
  parseDay: (body: unknown, date: string, retrievedAt: string, sections?: readonly string[]) => { items: OutputItem[]; dropped: Dropped };
};
