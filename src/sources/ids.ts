// Identificadores de los boletines admitidos en la entrada bulletins. Módulo hoja, sin dependencias del proyecto.
// BOPV no está: su API oficial no se pudo confirmar (véase el README).
export const BULLETINS = ["BOE", "BOJA", "DOG", "DOGC"] as const;
export type Bulletin = (typeof BULLETINS)[number];

export function isBulletin(v: unknown): v is Bulletin {
  return typeof v === "string" && (BULLETINS as readonly string[]).includes(v);
}
