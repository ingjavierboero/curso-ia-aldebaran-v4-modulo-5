import { describe, expect, it } from 'vitest';
import { InvalidIssuerIvaCondition } from '../../../src/domain/settings/errors.js';
import { ISSUER_IVA_CONDITIONS, IssuerIvaCondition } from '../../../src/domain/settings/IssuerIvaCondition.js';
import { IvaCondition } from '../../../src/domain/shared/IvaCondition.js';

describe('IssuerIvaCondition', () => {
  // Solo 4, 6, 13 y 16 emiten Factura C; Responsable Inscripto (1) y un código inexistente dan el
  // mismo error (FR-06, AC-07)
  it('test_issuer_iva_condition_responsable_inscripto_rechazada', () => {
    const monotributo = IssuerIvaCondition.of(6);
    expect(monotributo.code).toBe(6);
    expect(monotributo.name).toBe('Responsable Monotributo');
    expect(monotributo.condition).toBe(IvaCondition.of(6));
    expect(monotributo.equals(IssuerIvaCondition.of(6))).toBe(true);
    for (const code of [4, 13, 16]) expect(IssuerIvaCondition.of(code).code).toBe(code);

    expect(ISSUER_IVA_CONDITIONS.map((c) => c.code)).toEqual([4, 6, 13, 16]);
    expect(ISSUER_IVA_CONDITIONS[1]).toBe(IvaCondition.of(6));
    expect(Object.isFrozen(ISSUER_IVA_CONDITIONS)).toBe(true);

    let fromOne: unknown;
    let fromNinetyNine: unknown;
    try {
      IssuerIvaCondition.of(1);
    } catch (err) {
      fromOne = err;
    }
    try {
      IssuerIvaCondition.of(99);
    } catch (err) {
      fromNinetyNine = err;
    }
    expect(fromOne).toBeInstanceOf(InvalidIssuerIvaCondition);
    expect(fromNinetyNine).toBeInstanceOf(InvalidIssuerIvaCondition);
    expect((fromOne as Error).message).toBe((fromNinetyNine as Error).message);
    // el mensaje fijo nombra las 4 admitidas
    for (const name of [
      'IVA Sujeto Exento',
      'Responsable Monotributo',
      'Monotributista Social',
      'Monotributo Trabajador Independiente Promovido',
    ]) {
      expect((fromOne as Error).message).toContain(name);
    }

    // un IvaCondition válido para clientes pero no para el emisor
    expect(() => IssuerIvaCondition.of(5)).toThrow(InvalidIssuerIvaCondition);
    expect(() => IssuerIvaCondition.of(6.5)).toThrow(InvalidIssuerIvaCondition);
    expect(() => IssuerIvaCondition.of('6' as unknown as number)).toThrow(InvalidIssuerIvaCondition);
  });
});
