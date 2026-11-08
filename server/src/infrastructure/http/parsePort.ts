const DEFAULT_PORT = 3000;

/**
 * Puerto HTTP a partir de `PORT`: sin definir es 3000; si no, un entero decimal entre 1 y 65535.
 * Cualquier otro valor lanza, para que el arranque falle en vez de escuchar en un puerto inesperado.
 */
export function parsePort(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PORT;
  const port = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT inválido: "${raw}" (debe ser un entero entre 1 y 65535)`);
  }
  return port;
}
