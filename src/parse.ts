// Piezas comunes de todas las fuentes: la forma del elemento de salida, los recuentos de lo descartado, el filtro
// de tratamientos personales y los ayudantes de lectura. Solo biblioteca estándar. Cada fuente (sources/*.ts)
// conserva únicamente metadatos y enlaces; nunca texto íntegro ni nombres de firmantes.
import type { NormType } from "./classify.ts";
import type { Stage } from "./oposiciones.ts";

export const MAX_TEXT = 2000;

// Tratamientos personales ("don", "doña", "D.", "D.ª", "Dª", "Dña" con o sin punto) seguidos de espacio.
// No se usa \b porque no reconoce bien las letras acentuadas ni la ñ. La mirada atrás excluye letras y
// puntos, de modo que abreviaturas como "R.D. 123/2026" no se confunden con un tratamiento; los casos
// ambiguos se descartan igualmente, porque ante la duda prima la protección de datos personales.
const NAME_GUARD = /(?<![\p{L}.])(?:don|doña|d\.ª\.?|dª\.?|d\.a|dña\.?|d\.)(?=\s)/iu;
// Caracteres de formato invisibles (categoría Cf): guion blando U+00AD, marcas de dirección, controles
// bidireccionales, ancho cero, U+2060-2064 y la marca de orden de bytes.
const INVISIBLE = /\p{Cf}/gu;

// Texto que se somete al filtro: normalizado a NFKC (formas de ancho completo y de compatibilidad) y sin
// caracteres invisibles. Solo sirve para la comprobación; el título que se guarda no se modifica.
export function guardText(v: string): string {
  return v.normalize("NFKC").replace(INVISIBLE, "");
}

// Verdadero si el título lleva un tratamiento personal («don», «doña», «D.», …): se descarta en todas las fuentes.
// NFKC lleva «ª» a «a» («D.ª» pasa a «D.a»), por eso se comprueba también la forma NFC, donde «dª» sigue entero.
export function nameGuardHit(title: string): boolean {
  return NAME_GUARD.test(guardText(title)) || NAME_GUARD.test(title.normalize("NFC").replace(INVISIBLE, ""));
}

// Una relación del documento con otra norma (opción relations, solo BOE sección I).
export type Change = {
  // Palabra en castellano y en minúsculas («deroga», «modifica», «sustituye»…).
  action: string;
  // Código numérico de la tabla oficial de relaciones del BOE.
  code: number;
  targetId: string;
  // Solo para identificadores BOE-A: enlace al texto consolidado, de carácter meramente informativo.
  targetUrl?: string;
  // Texto del BOE sobre lo afectado, recortado; falta si pudiera nombrar a una persona.
  detail?: string;
};

// ok: análisis leído (la lista puede estar vacía); pending: el BOE aún no lo publica; error: no se pudo leer;
// skipped: no se consultó (tope de peticiones o errores seguidos).
export type ChangesStatus = "ok" | "pending" | "error" | "skipped";

export type OutputItem = {
  id: string;
  date: string;
  // BOE: "1" o, solo si el usuario las activa, "2B" (oposiciones) o "3". Boletines autonómicos: la etiqueta de su sección.
  section: string;
  department: string;
  epigraph: string;
  title: string;
  urlHtml?: string;
  urlPdf?: string;
  urlXml?: string;
  retrievedAt: string;
  source: string;
  sourceUrl: string;
  // Campo derivado por este Actor a partir del título; no es un metadato del BOE.
  normType: NormType;
  // Boletín de origen: "BOE", "BOJA", "DOG" o "DOGC".
  bulletin: string;
  // Solo en el DOGC: fecha (AAAA-MM-DD, Madrid) de la última actualización del conjunto de datos de la Generalitat; falta si no se pudo leer.
  sourceUpdated?: string;
  // Solo en la sección II-B (oposiciones): fase derivada del título; una pista de este Actor, no un dato oficial.
  stage?: Stage;
  // Solo con la opción relations y solo en la sección I del BOE.
  changes?: Change[];
  changesStatus?: ChangesStatus;
  // Desde la 1.9, en todos los elementos: verdadero si el elemento es una corrección de errores (por el título; derivado, no oficial).
  isCorrection?: boolean;
  // Desde la 1.9, en todos los elementos: identificador de la primera norma que corrige, solo con relations en la sección I del BOE; si no, null.
  correctsId?: string | null;
  // Solo con followIds: los identificadores seguidos que este elemento cambia.
  followed?: string[];
};

// Recuentos de lo descartado: identificador no válido, enlace no válido, filtro de nombres y texto demasiado largo.
// Con la sección III activada se añaden los epígrafes fuera del listado y el filtro de adjudicaciones y personas;
// sin ella esas dos claves no existen, de modo que la salida es la de 1.3.
export type Dropped = {
  badId: number;
  badUrl: number;
  nameGuard: number;
  tooLong: number;
  notAllowed?: number;
  personGuard?: number;
  // Solo en los boletines autonómicos: elementos que no son de disposiciones generales.
  otherSection?: number;
  // Solo con la sección II-B: actualizaciones y elementos sin fase reconocida que no se entregan por defecto.
  updatesOmitted?: number;
  othersOmitted?: number;
};

type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// La API devuelve un objeto cuando hay una sola entrada y una lista cuando hay varias.
export function many(v: unknown): Obj[] {
  if (Array.isArray(v)) return v.filter(isObj);
  return isObj(v) ? [v] : [];
}

// Los textos no se truncan, porque alteraría los metadatos del BOE: uno demasiado largo descarta el elemento.
export function text(v: unknown): string {
  return typeof v === "string" ? cleanText(v) : "";
}

// Controles C0/C1 (categoría Cc, incluido U+007F) y controles bidireccionales: U+061C, U+200E-200F, U+202A-202E y
// U+2066-2069. Nunca deben llegar a la salida ni a los avisos.
export const UNSAFE_CHARS = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/gu;

// Quita esos caracteres de un texto de salida conservando el tabulador y los saltos de línea, que se tratan
// como espacio al mostrarlos. Un texto sin ellos queda idéntico.
export function cleanText(v: string): string {
  return v.replace(UNSAFE_CHARS, (c) => (c === "\t" || c === "\n" || c === "\r" ? c : ""));
}

// Líneas de registro para lo descartado: solo recuentos, nunca contenido.
// label es el boletín de origen en los mensajes de enlaces («del BOE», «del BOJA»).
export function dropMessages(dropped: Dropped, label: string = "BOE"): string[] {
  const out: string[] = [];
  if (dropped.badId > 0) {
    out.push(
      dropped.badId === 1
        ? "descartado 1 elemento con identificador no válido"
        : `descartados ${dropped.badId} elementos con identificador no válido`,
    );
  }
  if (dropped.badUrl > 0) {
    out.push(
      dropped.badUrl === 1
        ? `descartado 1 enlace que no es del ${label}`
        : `descartados ${dropped.badUrl} enlaces que no son del ${label}`,
    );
  }
  if (dropped.tooLong > 0) {
    out.push(
      dropped.tooLong === 1
        ? "descartado 1 elemento con texto demasiado largo"
        : `descartados ${dropped.tooLong} elementos con texto demasiado largo`,
    );
  }
  if (dropped.nameGuard > 0) {
    out.push(
      dropped.nameGuard === 1
        ? "descartado 1 elemento por el filtro de nombres"
        : `descartados ${dropped.nameGuard} elementos por el filtro de nombres`,
    );
  }
  const otherSection = dropped.otherSection ?? 0;
  if (otherSection > 0) {
    out.push(
      otherSection === 1
        ? "descartado 1 elemento fuera de las disposiciones generales"
        : `descartados ${otherSection} elementos fuera de las disposiciones generales`,
    );
  }
  const notAllowed = dropped.notAllowed ?? 0;
  if (notAllowed > 0) {
    out.push(
      notAllowed === 1
        ? "descartado 1 elemento fuera del listado de epígrafes de la sección III"
        : `descartados ${notAllowed} elementos fuera del listado de epígrafes de la sección III`,
    );
  }
  const personGuard = dropped.personGuard ?? 0;
  if (personGuard > 0) {
    // Con la sección II-B activa (updatesOmitted existe) los descartes pueden venir de ella: texto genérico.
    const scope = dropped.updatesOmitted !== undefined ? "personas" : "adjudicaciones y personas de la sección III";
    out.push(
      personGuard === 1
        ? `descartado 1 elemento por el filtro de ${scope}`
        : `descartados ${personGuard} elementos por el filtro de ${scope}`,
    );
  }
  const updates = dropped.updatesOmitted ?? 0;
  if (updates > 0) {
    out.push(
      updates === 1
        ? "omitida 1 actualización de oposiciones (sección II-B)"
        : `omitidas ${updates} actualizaciones de oposiciones (sección II-B)`,
    );
  }
  const others = dropped.othersOmitted ?? 0;
  if (others > 0) {
    out.push(
      others === 1
        ? "omitido 1 elemento de oposiciones sin fase reconocida (sección II-B)"
        : `omitidos ${others} elementos de oposiciones sin fase reconocida (sección II-B)`,
    );
  }
  return out;
}

