import { InvalidEmail } from './errors.js';

// `local@dominio.tld`: sin espacios, una sola `@`, y el dominio con al menos un punto
// que separa etiquetas no vacías.
const EMAIL_FORMAT = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** Value object: email normalizado (trim + minúsculas), con formato válido y máximo 254 caracteres. */
export class Email {
  static readonly MAX_LENGTH = 254;

  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    if (typeof raw !== 'string') throw new InvalidEmail();
    const normalized = raw.trim().toLowerCase();
    if (normalized.length === 0 || normalized.length > Email.MAX_LENGTH) throw new InvalidEmail();
    if (!EMAIL_FORMAT.test(normalized)) throw new InvalidEmail();
    return new Email(normalized);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
