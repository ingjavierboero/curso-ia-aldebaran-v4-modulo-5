import { describe, expect, it } from 'vitest';
import { Forbidden } from '../../../src/domain/auth/errors.js';
import { createAuthContext } from '../../support/authContext.js';

describe('ListUsers', () => {
  // Un Admin ve Activos e Inactivos con nombre, email, perfil y estado, sin el hash (AC-01, AC-12)
  it('test_list_users_devuelve_activos_e_inactivos_sin_hash', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', name: 'Ana Admin', email: 'admin@empresa.com' });
    ctx.seedUser({
      id: 'u-baja',
      name: 'Bruno Baja',
      email: 'bruno@empresa.com',
      role: 'editor',
      status: 'inactivo',
    });

    const result = ctx.listUsers.execute(admin);

    expect(result).toEqual([
      { id: 'u-admin', name: 'Ana Admin', email: 'admin@empresa.com', role: 'admin', status: 'activo' },
      { id: 'u-baja', name: 'Bruno Baja', email: 'bruno@empresa.com', role: 'editor', status: 'inactivo' },
    ]);
    for (const user of result) {
      expect(Object.keys(user).sort()).toEqual(['email', 'id', 'name', 'role', 'status']);
      expect(JSON.stringify(user)).not.toContain('hashed:');
    }
  });

  it('ordena el listado por nombre', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-1', name: 'Zoe', email: 'zoe@empresa.com' });
    ctx.seedUser({ id: 'u-2', name: 'Ana', email: 'ana@empresa.com', role: 'consulta' });

    expect(ctx.listUsers.execute(admin).map((u) => u.name)).toEqual(['Ana', 'Zoe']);
  });

  // Editor y Consulta reciben Forbidden y ningún dato (AC-13)
  it('test_list_users_editor_no_autorizado', () => {
    const ctx = createAuthContext();
    ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    const editor = ctx.seedUser({ id: 'u-editor', email: 'editor@empresa.com', role: 'editor' });
    const consulta = ctx.seedUser({ id: 'u-consulta', email: 'consulta@empresa.com', role: 'consulta' });

    expect(() => ctx.listUsers.execute(editor)).toThrow(Forbidden);
    expect(() => ctx.listUsers.execute(consulta)).toThrow(Forbidden);
  });
});
