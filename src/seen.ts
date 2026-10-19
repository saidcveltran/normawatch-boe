// Memoria de los elementos ya entregados (almacén clave-valor SEEN) para las ejecuciones programadas.
// Solo biblioteca estándar: el almacenamiento real se inyecta, así que aquí no hay dependencia de Apify.
import { createHash } from "node:crypto";

export const SEEN_STORE_NAME = "SEEN";

// Clave del registro: una por cada combinación de departamentos y palabras clave, para que dos
// conjuntos de filtros distintos no se oculten elementos entre sí. El orden y las mayúsculas no cuentan.
export function seenKey(filters: { departments?: string[]; keywords?: string[] }): string {
  const norm = (list: string[] | undefined): string[] =>
    [...new Set((list ?? []).map((s) => s.trim().toLowerCase()))].sort();
  const canonical = JSON.stringify({ departments: norm(filters.departments), keywords: norm(filters.keywords) });
  return `ids-${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

// Tope de identificadores recordados: al superarlo se olvidan los más antiguos.
export const MAX_SEEN = 50_000;

const ID_FORMAT = /^BOE-A-[0-9]{4}-[0-9]+$/;

// De un valor guardado solo se conservan las entradas con forma de identificador del BOE.
function parseIds(raw: unknown): Set<string> {
  const ids = new Set<string>();
  if (Array.isArray(raw)) {
    for (const entry of raw) if (typeof entry === "string" && ID_FORMAT.test(entry)) ids.add(entry);
  }
  return ids;
}

export type SeenBackend = {
  read: () => Promise<unknown>;
  write: (ids: string[]) => Promise<void>;
};

export class SeenStore {
  private readonly ids: Set<string>;
  private readonly backend: SeenBackend;
  private readonly max: number;

  private constructor(backend: SeenBackend, ids: Set<string>, max: number) {
    this.backend = backend;
    this.ids = ids;
    this.max = max;
  }

  // Un valor guardado que no sea una lista se ignora (memoria vacía); en una lista se conservan
  // solo las entradas con forma de identificador del BOE.
  // Si la lectura falla o el valor no es una lista, se avisa (sin contenido) y se empieza vacío.
  static async open(backend: SeenBackend, max: number = MAX_SEEN, warn?: (message: string) => void): Promise<SeenStore> {
    let raw: unknown;
    try {
      raw = await backend.read();
    } catch {
      warn?.("SEEN ilegible, se empieza vacío");
      return new SeenStore(backend, new Set<string>(), max);
    }
    if (raw !== undefined && raw !== null && !Array.isArray(raw)) warn?.("SEEN ilegible, se empieza vacío");
    return new SeenStore(backend, parseIds(raw), max);
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  // Añade los identificadores ya entregados. Antes de guardar vuelve a leer el almacén y fusiona,
  // de modo que dos ejecuciones simultáneas solo se suman entre sí.
  async add(newIds: string[]): Promise<void> {
    if (newIds.length === 0) return;
    let stored = new Set<string>();
    try {
      stored = parseIds(await this.backend.read());
    } catch {
      // Sin lectura se guarda lo que se conoce.
    }
    for (const id of this.ids) stored.add(id);
    for (const id of newIds) {
      stored.delete(id);
      stored.add(id);
    }
    while (stored.size > this.max) {
      const oldest = stored.values().next().value;
      if (oldest === undefined) break;
      stored.delete(oldest);
    }
    this.ids.clear();
    for (const id of stored) this.ids.add(id);
    await this.backend.write([...stored]);
  }
}
