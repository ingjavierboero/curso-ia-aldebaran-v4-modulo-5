import { describe, expect, it } from 'vitest';
import { WeakPassword } from '../../src/domain/user/errors.js';
import { PasswordPolicy } from '../../src/domain/user/PasswordPolicy.js';

describe('PasswordPolicy', () => {
  it('PasswordPolicy rechaza 7 y 1025 caracteres con WeakPassword y acepta 8 y 1024', () => {
    expect(() => PasswordPolicy.assert('1234567')).toThrow(WeakPassword);
    expect(() => PasswordPolicy.assert('x'.repeat(1025))).toThrow(WeakPassword);
    expect(() => PasswordPolicy.assert('12345678')).not.toThrow();
    expect(() => PasswordPolicy.assert('x'.repeat(1024))).not.toThrow();
  });
});
