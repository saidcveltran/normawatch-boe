// Errores compartidos por el cliente del BOE y el analizador.

export class BoeError extends Error {
  constructor(message: string, options?: { cause?: string }) {
    super(message, options);
    this.name = "BoeError";
  }
}

// Nombre del error, sin su mensaje: el mensaje podría arrastrar contenido de la respuesta.
export function errName(err: unknown): string {
  return err instanceof Error && err.name ? err.name : "UnknownError";
}
