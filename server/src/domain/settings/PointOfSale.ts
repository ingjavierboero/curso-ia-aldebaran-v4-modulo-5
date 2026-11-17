import { InvalidPointOfSale } from './errors.js';

export const POINT_OF_SALE_MIN = 1;
export const POINT_OF_SALE_MAX = 99999;

/** Value object: punto de venta de ARCA, entero entre 1 y 99999 (FR-04). */
export class PointOfSale {
  private constructor(readonly value: number) {}

  /** Si no es un entero seguro en rango, `InvalidPointOfSale`. */
  static of(n: number): PointOfSale {
    if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw new InvalidPointOfSale();
    if (n < POINT_OF_SALE_MIN || n > POINT_OF_SALE_MAX) throw new InvalidPointOfSale();
    return new PointOfSale(n);
  }

  equals(other: PointOfSale): boolean {
    return this.value === other.value;
  }
}
