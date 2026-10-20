// Errores compartidos por el cliente del BOE y el analizador.

export class BoeError extends Error {
  constructor(message: string, options?: { cause?: string }) {
    super(message, options);
    this.name = "BoeError";
  }
}

// Nombre del error, sin su mensaje: el mensaje podría arrastrar contenido de la respuesta. Solo se acepta un
// nombre alfabético corto: un nombre con otro contenido podría arrastrar un secreto.
export function errName(err: unknown): string {
  return err instanceof Error && /^[A-Za-z]{1,40}$/.test(err.name) ? err.name : "UnknownError";
}
