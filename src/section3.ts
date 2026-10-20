// Sección III del BOE («Otras disposiciones»): listado de epígrafes admitidos y filtro de adjudicaciones y
// personas. Solo biblioteca estándar. Las constantes solo se amplían con un cambio revisado.

// Epígrafes admitidos, con la grafía del BOE. La comparación es exacta, sin distinguir mayúsculas y en NFC:
// un epígrafe parecido («Convenio», «Subvención», «Comunitat Valenciana. Convenio») no pasa. Todo lo demás
// de la sección III (indultos, premios, títulos nobiliarios, recursos, condecoraciones, fundaciones, reales
// academias, sentencias y cualquier epígrafe desconocido) se descarta y se cuenta.
export const SECTION3_EPIGRAPHS: readonly string[] = [
  "Convenios",
  "Encomienda de gestión",
  "Delegación de competencias",
  "Planes de estudios",
  "Cartas de servicios",
  "Subvenciones",
  "Ayudas",
  "Becas",
  "Impacto ambiental",
  "Instalaciones eléctricas",
  "Homologaciones",
  "Normalización",
  "Mercado de divisas",
  "Convenios colectivos de trabajo",
];

const fold = (v: string): string => v.normalize("NFC").toLowerCase();

const ALLOWED: ReadonlySet<string> = new Set(SECTION3_EPIGRAPHS.map(fold));

export function isAllowedEpigraph(epigraph: string): boolean {
  return ALLOWED.has(fold(epigraph));
}

// Expresiones de adjudicación o de persona concreta, como subcadena en minúsculas.
const AWARD_PHRASES: readonly string[] = [
  "se conceden",
  "se concede",
  "concesión de los premios",
  "a favor de",
  "interpuesto por",
  "se emplaza",
  "beneficiari",
  "adjudica",
  "relación de",
];

// Documento de identidad: DNI, NIE y DNI enmascarado. La letra se admite en minúscula (más estricto que
// lo habitual en el BOE) porque un falso positivo solo cuesta un elemento.
const DNI = /\b[0-9]{8}[A-Z]\b/i;
const NIE = /\b[XYZ][0-9]{7}[A-Z]\b/i;
const DNI_MASKED = /\*{3}[0-9]{4}\*{2}/;

const INVISIBLE = /\p{Cf}/gu;

// Verdadero si el título es de una adjudicación o puede nombrar a una persona física. El texto se normaliza
// a NFC y se le quitan los caracteres invisibles, igual que en el filtro de tratamientos personales.
export function personGuardHit(title: string): boolean {
  const clean = title.normalize("NFC").replace(INVISIBLE, "");
  const lower = clean.toLowerCase();
  if (AWARD_PHRASES.some((p) => lower.includes(p))) return true;
  return DNI.test(clean) || NIE.test(clean) || DNI_MASKED.test(clean);
}
