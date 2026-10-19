// Clasificación del tipo de norma a partir del inicio del título. Solo biblioteca estándar.
// El tipo es un dato derivado por este Actor: el BOE no lo publica en el sumario.

// Tipos de norma tal como los escribe el BOE. El orden es el de comprobación: ningún tipo va después de
// otro que sea un prefijo suyo más corto ("Real Decreto-ley" antes que "Real Decreto"). "Otro" es el
// valor por defecto y va el último.
export const NORM_TYPES = [
  "Corrección de errores",
  "Instrumento de ratificación",
  "Real Decreto Legislativo",
  "Real Decreto-ley",
  "Real Decreto",
  "Ley Orgánica",
  "Ley Foral",
  "Ley",
  "Decreto Legislativo",
  "Decreto-ley",
  "Decreto",
  "Orden",
  "Resolución",
  "Circular",
  "Acuerdo internacional",
  "Otro",
] as const;

export type NormType = (typeof NORM_TYPES)[number];

// Tipos que se reconocen por el inicio literal del título (todos menos los dos casos especiales).
const BY_PREFIX: readonly NormType[] = NORM_TYPES.filter(
  (t) => t !== "Acuerdo internacional" && t !== "Otro" && t !== "Corrección de errores",
);

// Inicios de título de un acuerdo internacional; solo cuentan en el departamento de Asuntos Exteriores.
const TREATY_STARTS = ["acuerdo", "canje de notas", "convenio"];

const INVISIBLE = /\p{Cf}/gu;

function norm(v: string): string {
  return v.normalize("NFC").replace(INVISIBLE, "").trim().toLowerCase();
}

// Vale si el texto empieza por el prefijo y lo que sigue no es una letra: "Ley" no encaja con "Leyenda".
function startsWithWord(text: string, prefix: string): boolean {
  if (!text.startsWith(prefix)) return false;
  const next = text.charAt(prefix.length);
  return next === "" || !/\p{L}/u.test(next);
}

// Devuelve el tipo de norma del título. El departamento es opcional y solo sirve para reconocer
// acuerdos internacionales. Nunca lanza: lo que no se reconoce es "Otro".
export function normTypeOf(title: string, department: string = ""): NormType {
  const t = norm(title);
  if (startsWithWord(t, "corrección de errores") || startsWithWord(t, "corrección de erratas")) {
    return "Corrección de errores";
  }
  for (const type of BY_PREFIX) {
    if (startsWithWord(t, type.toLowerCase())) return type;
  }
  if (norm(department).includes("asuntos exteriores") && TREATY_STARTS.some((s) => startsWithWord(t, s))) {
    return "Acuerdo internacional";
  }
  return "Otro";
}

export function isNormType(v: unknown): v is NormType {
  return typeof v === "string" && (NORM_TYPES as readonly string[]).includes(v);
}
