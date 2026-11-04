import { describe, expect, it } from 'vitest';
import { Email } from '../../src/domain/user/Email.js';
import { InvalidEmail } from '../../src/domain/user/errors.js';

describe('Email', () => {
  it('Email normaliza con trim y minúsculas', () => {
    expect(Email.create('  Admin@Empresa.COM ').value).toBe('admin@empresa.com');
  });

  it.each(['', '   ', 'sin-arroba', 'a@b', '@empresa.com', 'a@.com', 'a b@empresa.com', 'a@@empresa.com'])(
    'Email con formato inválido %j es rechazado con InvalidEmail',
    (raw) => {
      expect(() => Email.create(raw)).toThrow(InvalidEmail);
    },
  );

  it('Email de más de 254 caracteres es rechazado con InvalidEmail', () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(200)}.com`;
    const tooLong = `${local}@${domain}`;
    expect(tooLong.length).toBeGreaterThan(254);

    expect(() => Email.create(tooLong)).toThrow(InvalidEmail);
  });
});
