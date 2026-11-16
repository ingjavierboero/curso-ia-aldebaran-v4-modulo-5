/**
 * Violación de una restricción de SQLite con ese `code` y un mensaje que matchea `message` (regex
 * exacta, para no confundir `clients.cuit` con `clients.cuit_xxx`). Con better-sqlite3 (driver
 * síncrono) drizzle-orm 0.45.4 NO envuelve el `SqliteError` en `DrizzleQueryError`: llega tal cual.
 * Se recorre igual la cadena de `cause` por si una versión futura de Drizzle (o un driver async) lo
 * envuelve.
 */
export function isConstraintViolation(err: unknown, code: string, message: RegExp): boolean {
  for (let current: unknown = err, depth = 0; current instanceof Error && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === code && message.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}
