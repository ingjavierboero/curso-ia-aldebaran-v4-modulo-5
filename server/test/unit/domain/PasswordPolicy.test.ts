import { describe, expect, it } from 'vitest';
import { PasswordUnchanged, WeakPassword } from '../../../src/domain/user/errors.js';
import { PasswordPolicy } from '../../../src/domain/user/PasswordPolicy.js';

describe('PasswordPolicy', () => {
  it('PasswordPolicy rechaza 7 y 1025 caracteres con WeakPassword y acepta 8 y 1024', () => {
    expect(() => { PasswordPolicy.assert('1234567'); }).toThrow(WeakPassword);
    expect(() => { PasswordPolicy.assert('x'.repeat(1025)); }).toThrow(WeakPassword);
    expect(() => { PasswordPolicy.assert('12345678'); }).not.toThrow();
    expect(() => { PasswordPolicy.assert('x'.repeat(1024)); }).not.toThrow();
  });

  // FEAT-007 (FR-06): la nueva debe ser distinta de la actual, comparación exacta (AC-08)
  it('test_password_policy_assert_changed_igual_rechazado', () => {
    expect(() => { PasswordPolicy.assertChanged('clave-actual', 'clave-actual'); }).toThrow(PasswordUnchanged);
    expect(() => { PasswordPolicy.assertChanged('clave-actual', 'clave-actual'); }).toThrow(
      'La contraseña nueva debe ser distinta de la actual',
    );
    expect(() => { PasswordPolicy.assertChanged('clave-actual', 'clave-nueva'); }).not.toThrow();
    // comparación exacta: distinta en mayúsculas o espacios ya es otra contraseña
    expect(() => { PasswordPolicy.assertChanged('clave-actual', 'Clave-actual'); }).not.toThrow();
    expect(() => { PasswordPolicy.assertChanged('clave-actual', 'clave-actual '); }).not.toThrow();
  });
});
