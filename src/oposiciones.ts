// Sección II-B del BOE («Oposiciones y concursos», opción sections "2B"): fase de cada convocatoria derivada del
// título. Solo biblioteca estándar. La fase es una pista calculada por este Actor, no un dato oficial; el texto
// de los documentos nunca se pide. Las expresiones solo se amplían con un cambio revisado.

export type Stage = "convocatoria" | "actualizacion" | "otro";

// Pliegue del título: NFKD, sin marcas (tildes) ni caracteres invisibles, espacios en uno y minúsculas.
const fold = (v: string): string => v.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").replace(/\s+/gu, " ").toLowerCase();

// Trámites posteriores a la convocatoria. Ganan a las convocatorias: «se aprueba la relación de admitidos en el
// proceso selectivo» es una actualización aunque nombre el proceso. «tribunal» solo cuenta como trámite si es el de selección (el Tribunal de Cuentas también convoca). «han superado» y «relación de aspirantes»
// cubren las listas de aprobados que el BOE titula sin «lista»; «resuelve», «adjudica» y «nombra» los resultados.
const UPDATE: readonly RegExp[] = [
  /relacion (?:provisional|definitiva)/u,
  /admitid/u,
  /excluid/u,
  /tribunal(?:es)? (?:calificador|de seleccion|evaluador|de valoracion|examinador)/u,
  /composicion del tribunal/u,
  /desiert/u,
  /correccion de errores/u,
  /corrigen errores/u,
  /modifica la\b/u,
  /lista (?:definitiva )?de aprobados/u,
  /relacion de aspirantes/u,
  /han superado/u,
  /\bnombra(?:miento|mientos|n)?\b/u,
  /\bse resuelve\b/u,
  /\badjudican?\b/u,
  /\bse aplaza\b/u,
  /\bse amplia el plazo\b/u,
  /\bse suspende\b/u,
  /\bemplaza/u,
  /\binterpuest/u,
];

// «convoca» y «convocan» como palabra completa (no «convocado» ni «convocadas», que citan una convocatoria anterior).
const CALL: readonly RegExp[] = [
  /\bconvocan?\b/u,
  /proceso selectivo/u,
  /referente a la convocatoria/u,
  /\bpublica la convocatoria\b/u,
  /\banuncia (?:la )?convocatoria\b/u,
  /\bbases de la convocatoria\b/u,
  /provision de puestos?\b/u,
];

export function stageOf(title: string): Stage {
  const t = fold(title);
  if (UPDATE.some((r) => r.test(t))) return "actualizacion";
  if (CALL.some((r) => r.test(t))) return "convocatoria";
  return "otro";
}
