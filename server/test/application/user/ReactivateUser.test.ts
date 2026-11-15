import { describe, expect, it } from 'vitest';
import { Forbidden } from '../../../src/domain/auth/errors.js';
import { UserNotFound } from '../../../src/domain/user/errors.js';
import { createAuthContext } from '../../support/authContext.js';

describe('ReactivateUser', () => {
  // Un Inactivo vuelve a Activo y puede iniciar sesión (AC-09)
  it('test_reactivate_user_vuelve_a_activo', async () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', role: 'editor', status: 'inactivo', password: 'clave-bruno' });

    const result = ctx.reactivateUser.execute(admin, 'u-bruno');

    expect(result).toEqual({
      id: 'u-bruno',
      name: 'Ana Pérez',
      email: 'bruno@empresa.com',
      role: 'editor',
      status: 'activo',
    });
    expect(ctx.users.findById('u-bruno')?.status).toBe('activo');
    const session = await ctx.login.execute({ email: 'bruno@empresa.com', password: 'clave-bruno' });
    expect(session.user.id).toBe('u-bruno');
  });

  it('reactivar a un usuario Activo no cambia nada y lo devuelve (idempotente)', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    const active = ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', role: 'editor' });

    expect(ctx.reactivateUser.execute(admin, 'u-bruno').status).toBe('activo');
    expect(ctx.users.findById('u-bruno')).toBe(active);
  });

  it('usuario inexistente: UserNotFound', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });

    expect(() => ctx.reactivateUser.execute(admin, 'no-existe')).toThrow(UserNotFound);
  });

  it('Editor y Consulta no pueden reactivar (Forbidden, nada cambia)', () => {
    const ctx = createAuthContext();
    ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-baja', email: 'baja@empresa.com', role: 'consulta', status: 'inactivo' });
    const editor = ctx.seedUser({ id: 'u-editor', email: 'editor@empresa.com', role: 'editor' });
    const consulta = ctx.seedUser({ id: 'u-consulta', email: 'consulta@empresa.com', role: 'consulta' });

    expect(() => ctx.reactivateUser.execute(editor, 'u-baja')).toThrow(Forbidden);
    expect(() => ctx.reactivateUser.execute(consulta, 'u-baja')).toThrow(Forbidden);
    expect(ctx.users.findById('u-baja')?.status).toBe('inactivo');
  });

  // FR-12 / W-2 de VERIFY: el actor se relee dentro de la transacción. Con un actor que trae el
  // perfil Admin "viejo" pero ya fue degradado o dado de baja, la reactivación no se realiza.
  it('test_reactivate_user_actor_desactualizado_rechazado', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-otro-admin', email: 'otro@empresa.com' });
    ctx.seedUser({ id: 'u-baja', email: 'baja@empresa.com', role: 'consulta', status: 'inactivo' });

    ctx.users.update(admin.withProfile({ name: admin.name, email: admin.email, role: 'consulta' }));
    expect(() => ctx.reactivateUser.execute(admin, 'u-baja')).toThrow(Forbidden);

    ctx.users.update(admin.deactivated());
    expect(() => ctx.reactivateUser.execute(admin, 'u-baja')).toThrow(Forbidden);

    expect(ctx.users.findById('u-baja')?.status).toBe('inactivo');
  });
});
