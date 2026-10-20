// Memoria de los elementos ya entregados (almacén clave-valor SEEN) para las ejecuciones programadas.
// Solo biblioteca estándar: el almacenamiento real se inyecta, así que aquí no hay dependencia de Apify.
import { createHash } from "node:crypto";

export const SEEN_STORE_NAME = "SEEN";

// Clave del registro: una por cada combinación de departamentos y palabras clave, para que dos
// conjuntos de filtros distintos no se oculten elementos entre sí. El orden y las mayúsculas no cuentan.
// El filtro de tipos de norma entra en la clave solo cuando tiene valores, para que quien no lo use
// conserve la memoria que ya tenía. Lo mismo vale para las secciones: solo entran en la clave cuando no son
// la sección I sola, de modo que activar la sección III no mezcla su memoria con la de antes.
export function seenKey(filters: {
  departments?: string[];
  keywords?: string[];
  normTypes?: string[];
  sections?: string[];
  bulletins?: string[];
  relations?: boolean;
  followIds?: string[];
  includeProcessUpdates?: boolean;
}): string {
  const norm = (list: string[] | undefined): string[] =>
    [...new Set((list ?? []).map((s) => s.trim().toLowerCase()))].sort();
  const types = norm(filters.normTypes);
  const sections = norm(filters.sections);
  const bulletins = [...new Set((filters.bulletins ?? []).map((s) => s.trim().toUpperCase()))].sort();
  const onlyBoe = bulletins.length === 0 || (bulletins.length === 1 && bulletins[0] === "BOE");
  const onlyFirst = sections.length === 0 || (sections.length === 1 && sections[0] === "1");
  const follow = [...new Set((filters.followIds ?? []).map((s) => s.trim().toUpperCase()))].sort();
  const relations = filters.relations === true || follow.length > 0;
  const canonical = JSON.stringify({
    departments: norm(filters.departments),
    keywords: norm(filters.keywords),
    ...(types.length > 0 ? { normTypes: types } : {}),
    ...(onlyFirst ? {} : { sections }),
    ...(onlyBoe ? {} : { bulletins }),
    // Las relaciones (1.6) y las normas seguidas entran solo cuando se usan: quien no las use conserva su memoria.
    ...(relations ? { relations: true } : {}),
    ...(follow.length > 0 ? { followIds: follow } : {}),
    // Las actualizaciones de oposiciones (1.7) entran solo cuando se piden y la sección II-B está elegida.
    ...(filters.includeProcessUpdates === true && sections.includes("2b") ? { includeProcessUpdates: true } : {}),
  });
  return `ids-${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

// Tope de identificadores recordados: al superarlo se olvidan los más antiguos.
export const MAX_SEEN = 50_000;

// Identificadores de cada boletín: BOE (BOE-A-2026-1), BOJA (disposition.2026.199.1) y DOG (DOG-AnuncioC3K1-280926-0001).
const ID_FORMAT = /^(?:BOE-A-[0-9]{4}-[0-9]+|disposition\.[0-9]{4}\.[0-9]+\.[0-9]+|DOG-[A-Za-z0-9-]{1,80})$/;

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
  // Verdadero si la lectura inicial falló: entonces no se conoce lo que había guardado.
  private readonly openFailed: boolean;

  private constructor(backend: SeenBackend, ids: Set<string>, max: number, openFailed: boolean = false) {
    this.backend = backend;
    this.ids = ids;
    this.max = max;
    this.openFailed = openFailed;
  }

  // Un valor guardado que no sea una lista se ignora (memoria vacía); en una lista se conservan
  // solo las entradas con forma de identificador de algún boletín.
  // Si la lectura falla o el valor no es una lista, se avisa (sin contenido) y se empieza vacío.
  static async open(backend: SeenBackend, max: number = MAX_SEEN, warn?: (message: string) => void): Promise<SeenStore> {
    let raw: unknown;
    try {
      raw = await backend.read();
    } catch {
      warn?.("SEEN ilegible, se empieza vacío");
      return new SeenStore(backend, new Set<string>(), max, true);
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
    let rereadFailed = false;
    try {
      stored = parseIds(await this.backend.read());
    } catch {
      rereadFailed = true;
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
    // Si no se pudo leer ni al abrir ni ahora, la lista de memoria es solo parcial: escribirla
    // borraría lo que hubiera guardado. Se omite la escritura y se avisa con un error sin contenido.
    if (rereadFailed && this.openFailed) {
      throw new Error("SEEN no se pudo leer: no se guarda para no sobrescribir la lista existente");
    }
    await this.backend.write([...stored]);
  }
}
