import { describe, expect, it } from 'vitest';
import { Email } from '../../src/domain/user/Email.js';
import { InvalidName, InvalidRole } from '../../src/domain/user/errors.js';
import { parseUserName, parseUserRole, User, USER_ROLES, USER_STATUSES } from '../../src/domain/user/User.js';

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

  it('USER_ROLES y USER_STATUSES son los valores del dominio', () => {
    expect(USER_ROLES).toEqual(['admin', 'editor', 'consulta']);
    expect(USER_STATUSES).toEqual(['activo', 'inactivo']);
  });

  it('parseUserRole acepta los perfiles del dominio y rechaza cualquier otro con InvalidRole', () => {
    expect(parseUserRole('admin')).toBe('admin');
    expect(parseUserRole('editor')).toBe('editor');
    expect(parseUserRole('consulta')).toBe('consulta');

    expect(() => parseUserRole('superadmin')).toThrow(InvalidRole);
    expect(() => parseUserRole('Admin')).toThrow(InvalidRole);
    expect(() => parseUserRole('')).toThrow(InvalidRole);
    expect(() => parseUserRole(42 as unknown as string)).toThrow(InvalidRole);
  });

  describe('métodos inmutables', () => {
    const base = new User({
      id: 'u-3',
      name: 'Ana',
      email: Email.create('ana@empresa.com'),
      role: 'admin',
      status: 'activo',
      passwordHash: 'h',
      createdAt: new Date('2026-11-04T12:00:00.000Z'),
    });

    it('withProfile devuelve un usuario nuevo con nombre, email y perfil cambiados, sin tocar el original', () => {
      const changed = base.withProfile({ name: 'Ana María', email: Email.create('ana.maria@empresa.com'), role: 'editor' });

      expect(changed).not.toBe(base);
      expect(changed.id).toBe('u-3');
      expect(changed.name).toBe('Ana María');
      expect(changed.email.value).toBe('ana.maria@empresa.com');
      expect(changed.role).toBe('editor');
      expect(changed.status).toBe('activo');
      expect(changed.passwordHash).toBe('h');
      expect(changed.createdAt.toISOString()).toBe('2026-11-04T12:00:00.000Z');

      expect(base.name).toBe('Ana');
      expect(base.email.value).toBe('ana@empresa.com');
      expect(base.role).toBe('admin');
    });

    it('deactivated y reactivated cambian solo el estado, en un usuario nuevo', () => {
      const inactive = base.deactivated();
      expect(inactive).not.toBe(base);
      expect(inactive.status).toBe('inactivo');
      expect(inactive.role).toBe('admin');
      expect(base.status).toBe('activo');

      const active = inactive.reactivated();
      expect(active.status).toBe('activo');
      expect(inactive.status).toBe('inactivo');
    });

    it('isActiveAdmin es verdadero solo para un Admin Activo', () => {
      expect(base.isActiveAdmin()).toBe(true);
      expect(base.deactivated().isActiveAdmin()).toBe(false);
      expect(base.withProfile({ name: base.name, email: base.email, role: 'editor' }).isActiveAdmin()).toBe(false);
    });
  });
});
