import { describe, expect, it } from 'vitest';
import { Email } from '../../src/domain/user/Email.js';
import { InvalidName } from '../../src/domain/user/errors.js';
import { parseUserName, User } from '../../src/domain/user/User.js';

describe('User', () => {
  it('User.isActive es falso para un usuario Inactivo', () => {
    const base = {
      id: 'u-1',
      name: 'Ana',
      email: Email.create('ana@empresa.com'),
      role: 'consulta' as const,
      passwordHash: 'h',
      createdAt: new Date(),
    };

    expect(new User({ ...base, status: 'activo' }).isActive()).toBe(true);
    expect(new User({ ...base, status: 'inactivo' }).isActive()).toBe(false);
  });

  it('User copia createdAt: mutar la Date pasada al constructor no cambia el usuario', () => {
    const createdAt = new Date('2026-11-04T12:00:00.000Z');
    const user = new User({
      id: 'u-2',
      name: 'Ana',
      email: Email.create('ana@empresa.com'),
      role: 'consulta',
      status: 'activo',
      passwordHash: 'h',
      createdAt,
    });

    createdAt.setTime(0);

    expect(user.createdAt.toISOString()).toBe('2026-11-04T12:00:00.000Z');
  });

  it('parseUserName recorta espacios y acepta de 1 a 100 caracteres', () => {
    expect(parseUserName('  Ana Pérez ')).toBe('Ana Pérez');
    expect(parseUserName('x'.repeat(100))).toHaveLength(100);
  });

  it('parseUserName rechaza vacío y más de 100 caracteres con InvalidName', () => {
    expect(() => parseUserName('')).toThrow(InvalidName);
    expect(() => parseUserName('   ')).toThrow(InvalidName);
    expect(() => parseUserName('x'.repeat(101))).toThrow(InvalidName);
  });
});
