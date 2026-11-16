/** Body (o parámetro de ruta) inválido: campo faltante, de otro tipo o fuera de rango: 400. */
export class InvalidBody extends Error {
  override readonly name = 'InvalidBody';
}

/** El body como objeto JSON plano; cualquier otra cosa (array, null, ausente) → `InvalidBody`. */
export function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new InvalidBody('El body debe ser un objeto JSON');
  }
  return body as Record<string, unknown>;
}

/** Campo string obligatorio, con largo máximo opcional; si no, `InvalidBody` nombrando el campo. */
export function requiredString(body: Record<string, unknown>, field: string, maxLength?: number): string {
  const value = body[field];
  if (typeof value !== 'string') {
    throw new InvalidBody(`El campo "${field}" es obligatorio y debe ser texto`);
  }
  return withinMaxLength(value, field, maxLength);
}

/**
 * Campo string opcional: ausente → `undefined`; presente, debe ser texto (`null` incluido es
 * inválido) y respetar el largo máximo; si no, `InvalidBody` nombrando el campo.
 */
export function optionalString(body: Record<string, unknown>, field: string, maxLength?: number): string | undefined {
  if (!Object.hasOwn(body, field) || body[field] === undefined) return undefined;
  const value = body[field];
  if (typeof value !== 'string') {
    throw new InvalidBody(`El campo "${field}" debe ser texto`);
  }
  return withinMaxLength(value, field, maxLength);
}

/**
 * Campo entero obligatorio: un número JSON entero. Un texto (`"5"`), un decimal o `null` son
 * `InvalidBody`; el rango lo valida el dominio.
 */
export function requiredInteger(body: Record<string, unknown>, field: string): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new InvalidBody(`El campo "${field}" es obligatorio y debe ser un número entero`);
  }
  return value;
}

/** Campo entero opcional: ausente → `undefined`; presente, con las reglas de `requiredInteger`. */
export function optionalInteger(body: Record<string, unknown>, field: string): number | undefined {
  if (!Object.hasOwn(body, field) || body[field] === undefined) return undefined;
  const value = body[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new InvalidBody(`El campo "${field}" debe ser un número entero`);
  }
  return value;
}

export interface StringArrayLimits {
  /** Cantidad máxima de elementos (el mínimo es 1). */
  maxItems: number;
  /** Largo máximo de cada elemento. */
  maxLength: number;
}

/**
 * Campo lista de textos obligatorio: de 1 a `maxItems` elementos, cada uno de hasta `maxLength`
 * caracteres y sin repetidos. Si no, `InvalidBody` nombrando el campo.
 */
export function requiredStringArray(
  body: Record<string, unknown>,
  field: string,
  limits: StringArrayLimits,
): string[] {
  const value = body[field];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new InvalidBody(`El campo "${field}" es obligatorio y debe ser una lista de textos`);
  }
  if (value.length === 0 || value.length > limits.maxItems) {
    throw new InvalidBody(`El campo "${field}" debe tener entre 1 y ${limits.maxItems} elementos`);
  }
  if (value.some((item) => item.length > limits.maxLength)) {
    throw new InvalidBody(`Cada elemento de "${field}" admite como máximo ${limits.maxLength} caracteres`);
  }
  if (new Set(value).size !== value.length) {
    throw new InvalidBody(`El campo "${field}" no admite elementos repetidos`);
  }
  return value;
}

/** Largo máximo de un id que llega en la ruta o en el body (FEAT-010). */
export const ID_MAX_LENGTH = 64;

/** Parámetro de ruta (`:id`) con largo máximo; si lo supera, `InvalidBody` (400). */
export function boundedParam(value: string, name: string, maxLength: number): string {
  if (value.length > maxLength) {
    throw new InvalidBody(`El parámetro "${name}" admite como máximo ${maxLength} caracteres`);
  }
  return value;
}

function withinMaxLength(value: string, field: string, maxLength: number | undefined): string {
  if (maxLength !== undefined && value.length > maxLength) {
    throw new InvalidBody(`El campo "${field}" admite como máximo ${maxLength} caracteres`);
  }
  return value;
}
