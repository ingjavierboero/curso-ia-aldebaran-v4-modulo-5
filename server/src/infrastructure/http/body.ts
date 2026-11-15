/** Body de la solicitud inválido (campo faltante, de otro tipo o fuera de rango): 400. */
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

function withinMaxLength(value: string, field: string, maxLength: number | undefined): string {
  if (maxLength !== undefined && value.length > maxLength) {
    throw new InvalidBody(`El campo "${field}" admite como máximo ${maxLength} caracteres`);
  }
  return value;
}
