/**
 * Una fecha guardada en la base no es un ISO 8601 válido. Tipado para que quien registra el fallo
 * pueda informar qué pasó con `err.name` sin el mensaje, que trae el valor guardado (FEAT-004, FR-06).
 */
export class InvalidStoredDate extends Error {
  override readonly name = 'InvalidStoredDate';
}

/**
 * Hidrata una fecha ISO 8601 leída de la base. Un valor que no se puede interpretar lanza
 * `InvalidStoredDate` en vez de devolver `Invalid Date`: una fecha NaN hace que las comparaciones
 * (p. ej. `Session.isExpired`) den `false` y el dominio falle abierto.
 *
 * @param field columna de origen (`tabla.columna`), para que el error diga qué dato está corrupto.
 */
export function parseIsoDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidStoredDate(`Fecha inválida en ${field}: ${JSON.stringify(value)} no es un ISO 8601 válido`);
  }
  return date;
}
