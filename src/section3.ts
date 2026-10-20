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

// Pliegue común del título y de las expresiones, en este orden: NFKD (separa tildes y lleva las formas de
// compatibilidad a su forma básica; «İ» queda como «i» más un punto combinado), se quitan marcas (\p{M}) y
// caracteres invisibles (\p{Cf}), todo espacio (incluidos NBSP, U+202F y los finos) pasa a uno solo y, si se
// pide, a minúsculas. Así «concesion» y «concesión» coinciden. Solo para el filtro de personas: el listado de
// epígrafes sigue exigiendo las tildes.
const foldText = (v: string, lower: boolean): string => {
  const f = v.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").replace(/\s+/gu, " ");
  return lower ? f.toLowerCase() : f;
};

// Expresiones de adjudicación o de persona concreta, ya plegadas, como subcadena.
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
].map((p) => foldText(p, true));

// Documentos de identidad, sobre el texto plegado. Las formas compactas (sin espacios) admiten la letra en
// minúscula; las que llevan espacio exigen mayúsculas para no confundir «12.345.678 y otras» con un DNI.
const DNI = /\b[0-9]{8}[A-Z]\b/i;
const NIE = /\b[XYZ][0-9]{7}[A-Z]\b/i;
const DNI_SEP = /(?<![\d.,])(?:\d{2}\.?\d{3}\.?\d{3}|\d\.\d{3}\.\d{3})(?:[.-]?[A-Za-z]|\s[A-Z])(?![\p{L}\d])/u;
const NIE_SEP = /(?<![\p{L}\d])(?:[XYZxyz][.-]?\d{7}[.-]?[A-Za-z]|[XYZ][\s.-]?\d{7}[\s.-]?[A-Z])(?![\p{L}\d])/u;
const DNI_MASKED = /\*{2,}\d{1,2}\.?\d{3}\*+/;

// Tratamientos de cortesía, sobre el texto plegado en minúsculas («señor» queda «senor»).
const COURTESY = /(?<![\p{L}\d])(?:sra?|dra?)\.|(?<![\p{L}\d])senora?(?![\p{L}\d])/u;

// Verdadero si el título es de una adjudicación o puede nombrar a una persona física.
export function personGuardHit(title: string): boolean {
  const clean = foldText(title, false);
  const lower = clean.toLowerCase();
  if (AWARD_PHRASES.some((p) => lower.includes(p))) return true;
  if (COURTESY.test(lower)) return true;
  return DNI.test(clean) || NIE.test(clean) || DNI_SEP.test(clean) || NIE_SEP.test(clean) || DNI_MASKED.test(clean);
}
