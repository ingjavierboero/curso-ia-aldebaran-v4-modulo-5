import { describe, expect, it } from 'vitest';
import { InvalidPointOfSale } from '../../../src/domain/settings/errors.js';
import { PointOfSale } from '../../../src/domain/settings/PointOfSale.js';

describe('PointOfSale', () => {
  // Entero entre 1 y 99999 (FR-04, AC-04)
  it('test_point_of_sale_valido_5', () => {
    expect(PointOfSale.of(5).value).toBe(5);
    expect(PointOfSale.of(1).value).toBe(1);
    expect(PointOfSale.of(99999).value).toBe(99999);
    expect(PointOfSale.of(5).equals(PointOfSale.of(5))).toBe(true);
  });

  // Cero, más de 99999 o no entero (FR-04, AC-05)
  it('test_point_of_sale_invalido_rechazado', () => {
    expect(() => PointOfSale.of(0)).toThrow(InvalidPointOfSale);
    expect(() => PointOfSale.of(100000)).toThrow(InvalidPointOfSale);
    expect(() => PointOfSale.of(2.5)).toThrow(InvalidPointOfSale);
    expect(() => PointOfSale.of(-1)).toThrow(InvalidPointOfSale);
    expect(() => PointOfSale.of(Number.NaN)).toThrow(InvalidPointOfSale);
    expect(() => PointOfSale.of(Number.POSITIVE_INFINITY)).toThrow(InvalidPointOfSale);
    expect(() => PointOfSale.of('5' as unknown as number)).toThrow(InvalidPointOfSale);
  });
});
