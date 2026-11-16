import { InvalidCuit } from './errors.js';

const CUIT_FORMAT = /^[0-9]{11}$/;
/** Prefijos admitidos (D-05): personas humanas 20/23/24/27, personas jurídicas 30/33/34. */
const VALID_PREFIXES: ReadonlySet<string> = new Set(['20', '23', '24', '27', '30', '33', '34']);
const CHECK_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/**
 * Value object: CUIT de 11 dígitos, sin guiones (S-03), con prefijo admitido y dígito verificador
 * módulo 11 válido (FR-05).
 */
export class Cuit {
  private constructor(readonly value: string) {}

  /** Quita guiones y espacios y valida; si no, `InvalidCuit`. */
  static parse(raw: string): Cuit {
    if (typeof raw !== 'string') throw new InvalidCuit();
    const digits = raw.replace(/[-\s]/g, '');
    if (!CUIT_FORMAT.test(digits)) throw new InvalidCuit();
    if (!VALID_PREFIXES.has(digits.slice(0, 2))) throw new InvalidCuit();
    if (checkDigit(digits) !== Number(digits[10])) throw new InvalidCuit();
    return new Cuit(digits);
  }

  equals(other: Cuit): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/** `11 − (suma ponderada mod 11)`; 11 → 0; 10 no tiene dígito válido (devuelve -1). */
function checkDigit(digits: string): number {
  const sum = CHECK_WEIGHTS.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0);
  const dv = 11 - (sum % 11);
  if (dv === 11) return 0;
  if (dv === 10) return -1;
  return dv;
}
