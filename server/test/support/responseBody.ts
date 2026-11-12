/**
 * Estrecha el `res.body` de supertest (que llega como `any`) a la forma que el test espera.
 *
 * Recibe el body como `unknown` y una descripción de los campos que el test va a leer. Si la forma
 * coincide devuelve el mismo objeto, tipado; si no, lanza un Error que nombra el campo faltante o con
 * el tipo equivocado, para que el test falle con ese mensaje y no con un `undefined` silencioso.
 * Solo comprueba los campos descritos: los demás se conservan, pero no quedan en el tipo.
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'unknown';
export interface BodyShape {
  readonly [field: string]: FieldType | BodyShape;
}

type FieldValue<F> = F extends 'string'
  ? string
  : F extends 'number'
    ? number
    : F extends 'boolean'
      ? boolean
      : F extends 'object'
        ? Record<string, unknown>
        : F extends 'unknown'
          ? unknown
          : F extends BodyShape
            ? Narrowed<F>
            : never;

export type Narrowed<S extends BodyShape> = { [K in keyof S]: FieldValue<S[K]> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function check(value: Record<string, unknown>, shape: BodyShape, path: string): void {
  for (const [field, expected] of Object.entries(shape)) {
    const fieldPath = path === '' ? field : `${path}.${field}`;
    if (!Object.hasOwn(value, field)) {
      throw new Error(`res.body: falta el campo "${fieldPath}"`);
    }
    const actual = value[field];
    if (typeof expected !== 'string') {
      if (!isPlainObject(actual)) {
        throw new Error(`res.body: el campo "${fieldPath}" no es un objeto (es ${describe(actual)})`);
      }
      check(actual, expected, fieldPath);
      continue;
    }
    if (expected === 'unknown') continue;
    const matches = expected === 'object' ? isPlainObject(actual) : typeof actual === expected;
    if (!matches) {
      throw new Error(`res.body: el campo "${fieldPath}" no es ${expected} (es ${describe(actual)})`);
    }
  }
}

function assertShape<S extends BodyShape>(body: unknown, shape: S): asserts body is Narrowed<S> {
  if (!isPlainObject(body)) {
    throw new Error(`res.body no es un objeto (es ${describe(body)})`);
  }
  check(body, shape, '');
}

export function responseBody<const S extends BodyShape>(body: unknown, shape: S): Narrowed<S> {
  assertShape(body, shape);
  return body;
}
