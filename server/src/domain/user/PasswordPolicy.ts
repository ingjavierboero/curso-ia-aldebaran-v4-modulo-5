import { WeakPassword } from './errors.js';

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
} as const;
