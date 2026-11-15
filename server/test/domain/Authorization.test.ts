import { describe, expect, it } from 'vitest';
import { assertCan, can } from '../../src/domain/auth/Authorization.js';
import { Forbidden } from '../../src/domain/auth/errors.js';
import type { UserRole } from '../../src/domain/user/User.js';

describe('Authorization', () => {
  // Un Admin puede leer y gestionar usuarios (AC-01)
  it('test_authorization_admin_puede_leer_y_gestionar_usuarios', () => {
    expect(can('admin', 'users.read')).toBe(true);
    expect(can('admin', 'users.manage')).toBe(true);
    expect(() => { assertCan('admin', 'users.read'); }).not.toThrow();
    expect(() => { assertCan('admin', 'users.manage'); }).not.toThrow();
  });

  // Editor y Consulta no pueden users.read ni users.manage (AC-13, AC-14)
  it('test_authorization_editor_y_consulta_sin_permiso_rechazado', () => {
    for (const role of ['editor', 'consulta'] as const) {
      expect(can(role, 'users.read')).toBe(false);
      expect(can(role, 'users.manage')).toBe(false);
      expect(() => { assertCan(role, 'users.read'); }).toThrow(Forbidden);
      expect(() => { assertCan(role, 'users.manage'); }).toThrow(Forbidden);
    }
  });

  it('la tabla de permisos no se expone fuera del módulo', async () => {
    const mod: Record<string, unknown> = await import('../../src/domain/auth/Authorization.js');

    expect(mod).not.toHaveProperty('PERMISSIONS');
  });

  it('deny-by-default: un perfil desconocido en tiempo de ejecución no tiene ningún permiso', () => {
    const unknownRole = 'superadmin' as UserRole;

    expect(can(unknownRole, 'users.read')).toBe(false);
    // ni las propiedades heredadas de Object.prototype cuentan como perfil
    expect(can('toString' as UserRole, 'users.read')).toBe(false);
    expect(() => { assertCan(unknownRole, 'users.manage'); }).toThrow(Forbidden);
  });
});
