// Interfaz común de las fuentes (C3.4): una por boletín, con la misma forma de salida.
import type { FetchOptions, FetchResult } from "../http.ts";
import type { Dropped, OutputItem } from "../parse.ts";
import type { Bulletin } from "./ids.ts";

export type SourceAdapter = {
  id: Bulletin;
  // Pide el documento de un día (fecha ya validada). Un día sin boletín devuelve status "empty".
  fetchDay: (date: string, options: FetchOptions) => Promise<FetchResult>;
  // Convierte el documento en elementos de salida. sections e includeProcessUpdates solo los usa el BOE (secciones III y II-B opcionales).
  parseDay: (body: unknown, date: string, retrievedAt: string, sections?: readonly string[], includeProcessUpdates?: boolean) => { items: OutputItem[]; dropped: Dropped };
};
