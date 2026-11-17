/**
 * Texto acotado: quita los espacios del principio y del final y exige de 1 a `max` caracteres. Si
 * no es texto o queda fuera de rango, lanza el error que construye `makeError` (cada módulo usa el
 * suyo, con su mensaje fijo).
 */
export function parseBoundedText(raw: string, max: number, makeError: () => Error): string {
  if (typeof raw !== 'string') throw makeError();
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > max) throw makeError();
  return trimmed;
}
