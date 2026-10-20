// Validación estricta de fechas, compartida por la entrada y por las fuentes (sin otras dependencias del proyecto).

// Estricta: solo AAAA-MM-DD de un día real del calendario.
export function validDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}
