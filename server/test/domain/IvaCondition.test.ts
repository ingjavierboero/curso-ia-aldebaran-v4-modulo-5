import { describe, expect, it } from 'vitest';
import { InvalidIvaCondition } from '../../src/domain/shared/errors.js';
import { IVA_CONDITIONS, IvaCondition } from '../../src/domain/shared/IvaCondition.js';

const EXPECTED: ReadonlyArray<readonly [number, string]> = [
  [1, 'IVA Responsable Inscripto'],
  [4, 'IVA Sujeto Exento'],
  [5, 'Consumidor Final'],
  [6, 'Responsable Monotributo'],
  [7, 'Sujeto No Categorizado'],
  [8, 'Proveedor del Exterior'],
  [9, 'Cliente del Exterior'],
  [10, 'IVA Liberado – Ley N° 19.640'],
  [13, 'Monotributista Social'],
  [15, 'IVA No Alcanzado'],
  [16, 'Monotributo Trabajador Independiente Promovido'],
];

describe('IvaCondition', () => {
  // Solo los 11 códigos de Factura C, cada uno con su nombre (FR-04, AC-05)
  it('test_iva_condicion_invalida_rechazada', () => {
    for (const [code, name] of EXPECTED) {
      const condition = IvaCondition.of(code);
      expect(condition.code).toBe(code);
      expect(condition.name).toBe(name);
    }
    expect(IVA_CONDITIONS.map((c) => [c.code, c.name])).toEqual(EXPECTED);
    expect(Object.isFrozen(IVA_CONDITIONS)).toBe(true);
    // una sola vía pública a la tabla: IVA_CONDITIONS (y `of`)
    expect(IvaCondition).not.toHaveProperty('ALL');
    expect(IvaCondition.of(5)).toBe(IVA_CONDITIONS[2]);

    expect(() => IvaCondition.of(2)).toThrow(InvalidIvaCondition);
    expect(() => IvaCondition.of(99)).toThrow(InvalidIvaCondition);
    expect(() => IvaCondition.of(0)).toThrow(InvalidIvaCondition);
    expect(() => IvaCondition.of(5.5)).toThrow(InvalidIvaCondition);
    expect(() => IvaCondition.of(Number.NaN)).toThrow(InvalidIvaCondition);
    expect(() => IvaCondition.of('5' as unknown as number)).toThrow(InvalidIvaCondition);
  });
});
