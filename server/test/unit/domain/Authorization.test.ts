import { describe, expect, it } from 'vitest';
import { assertCan, can } from '../../../src/domain/auth/Authorization.js';
import { Forbidden } from '../../../src/domain/auth/errors.js';
import type { UserRole } from '../../../src/domain/user/User.js';

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

  // Admin y Editor gestionan clientes y productos; Consulta solo los lee (FR-19, AC-16)
  it('test_authorization_permisos_de_clientes_y_productos', () => {
    const all = ['clients.read', 'clients.manage', 'products.read', 'products.manage'] as const;
    for (const role of ['admin', 'editor'] as const) {
      for (const action of all) {
        expect(can(role, action), `${role} ${action}`).toBe(true);
        expect(() => { assertCan(role, action); }).not.toThrow();
      }
    }

    expect(can('consulta', 'clients.read')).toBe(true);
    expect(can('consulta', 'products.read')).toBe(true);
    expect(can('consulta', 'clients.manage')).toBe(false);
    expect(can('consulta', 'products.manage')).toBe(false);
    expect(() => { assertCan('consulta', 'clients.manage'); }).toThrow(Forbidden);
    expect(() => { assertCan('consulta', 'products.manage'); }).toThrow(Forbidden);

    // los permisos de usuarios no cambian: Editor y Consulta siguen sin users.*
    expect(can('editor', 'users.manage')).toBe(false);
    expect(can('consulta', 'users.read')).toBe(false);
  });

  // Los tres perfiles leen la configuración; solo Admin la cambia (FR-12, AC-13)
  it('test_authorization_permisos_de_configuracion', () => {
    for (const role of ['admin', 'editor', 'consulta'] as const) {
      expect(can(role, 'settings.read'), `${role} settings.read`).toBe(true);
      expect(() => { assertCan(role, 'settings.read'); }).not.toThrow();
    }

    expect(can('admin', 'settings.manage')).toBe(true);
    expect(() => { assertCan('admin', 'settings.manage'); }).not.toThrow();
    for (const role of ['editor', 'consulta'] as const) {
      expect(can(role, 'settings.manage'), `${role} settings.manage`).toBe(false);
      expect(() => { assertCan(role, 'settings.manage'); }).toThrow(Forbidden);
    }
  });

  it('la tabla de permisos no se expone fuera del módulo', async () => {
    const mod: Record<string, unknown> = await import('../../../src/domain/auth/Authorization.js');

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
