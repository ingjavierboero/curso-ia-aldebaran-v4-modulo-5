import { PasswordUnchanged, WeakPassword } from './errors.js';

/** Mínimo 8 (FR-07) y máximo 1024 caracteres (acota el costo de argon2id, R-03). */
export const PasswordPolicy = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 1024,

  assert(plain: string): void {
    if (
      typeof plain !== 'string' ||
      plain.length < PasswordPolicy.MIN_LENGTH ||
      plain.length > PasswordPolicy.MAX_LENGTH
    ) {
      throw new WeakPassword();
    }
  },

  /** La nueva debe ser distinta de la actual, con comparación exacta (FEAT-007, FR-06). */
  assertChanged(current: string, next: string): void {
    if (current === next) throw new PasswordUnchanged();
  },
} as const;
