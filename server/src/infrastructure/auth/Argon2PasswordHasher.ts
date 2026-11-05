import { type Algorithm, hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../../domain/auth/PasswordHasher.js';

// `Algorithm` es un `const enum` ambiente: con `verbatimModuleSyntax` no se puede leer `Algorithm.Argon2id`
// (TS2748). Su valor es 2; el tipo garantiza que es un miembro válido del enum.
const ARGON2ID: Algorithm = 2;

export interface Argon2Params {
  /** KiB de memoria por hash. */
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

/** Parámetros de producción (NFR-01, ADR-002): mínimos de OWASP para argon2id. */
export const ARGON2_PRODUCTION_PARAMS: Readonly<Argon2Params> = Object.freeze({
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

/** `PasswordHasher` con argon2id (`@node-rs/argon2`). El hash queda en formato PHC. */
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly params: Argon2Params;

  constructor(params: Partial<Argon2Params> = {}) {
    this.params = { ...ARGON2_PRODUCTION_PARAMS, ...params };
  }

  hash(plain: string): Promise<string> {
    return hash(plain, { ...this.params, algorithm: ARGON2ID });
  }

  /**
   * Un hash que no está en formato PHC válido se trata como no coincidente: `false`. Cualquier otro
   * error de argon2 (memoria, hilos, fallo nativo…) se relanza.
   */
  async verify(passwordHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plain);
    } catch (err) {
      if (isMalformedHashError(err)) return false;
      throw err;
    }
  }
}

/**
 * Mensajes con los que `@node-rs/argon2` 2.2.2 rechaza un hash mal formado: el parseo PHC falla con
 * "Decoding failed" y los parámetros fuera de rango con "Salt is too short", "Memory cost is too
 * small", etc. Todos llegan con `code === 'InvalidArg'`. Quedan afuera a propósito los errores
 * operativos con ese mismo código ("Memory allocation error", "Threading failure"…).
 */
const MALFORMED_HASH_MESSAGE =
  /^(Decoding failed|(Output|Salt|Secret|Associated data) is too (short|long)|(Time|Memory) cost is too (small|large)|Too (few|many) lanes|There is no such version of Argon2|Some of encoded parameters are too long or too short)$/;

function isMalformedHashError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as { code?: unknown }).code === 'InvalidArg' &&
    MALFORMED_HASH_MESSAGE.test(err.message)
  );
}
