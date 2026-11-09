/**
 * Hidrata una fecha ISO 8601 leída de la base. Un valor que no se puede interpretar lanza en vez de
 * devolver `Invalid Date`: una fecha NaN hace que las comparaciones (p. ej. `Session.isExpired`)
 * den `false` y el dominio falle abierto.
 *
 * @param field columna de origen (`tabla.columna`), para que el error diga qué dato está corrupto.
 */
export function parseIsoDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha inválida en ${field}: ${JSON.stringify(value)} no es un ISO 8601 válido`);
  }
  return date;
}
