import { InvalidBillingHour } from './errors.js';

// Exactamente dos dígitos ASCII, dos puntos y dos dígitos: `9:00` y `11:00:00` no pasan.
const HOUR_FORMAT = /^([0-9]{2}):([0-9]{2})$/;

/** Value object: hora de facturación `HH:MM`, entre 00:00 y 23:59 (FR-02). */
export class BillingHour {
  private constructor(readonly value: string) {
    // Inmutable también en tiempo de ejecución: `DEFAULT` es una instancia compartida.
    Object.freeze(this);
  }

  /** Hora de facturación mientras un Admin no configure otra (FR-03). */
  static readonly DEFAULT = new BillingHour('11:00');

  /** Valida formato y rango; si no, `InvalidBillingHour`. */
  static parse(raw: string): BillingHour {
    if (typeof raw !== 'string') throw new InvalidBillingHour();
    const match = HOUR_FORMAT.exec(raw);
    if (match === null) throw new InvalidBillingHour();
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) throw new InvalidBillingHour();
    return new BillingHour(raw);
  }

  equals(other: BillingHour): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
