import { describe, expect, it } from 'vitest';
import { InvalidCredentials, Unauthenticated } from '../../../src/application/auth/errors.js';
import { Forbidden } from '../../../src/domain/auth/errors.js';
import { LastActiveAdmin, UserNotFound } from '../../../src/domain/user/errors.js';
import { createAuthContext } from '../../support/authContext.js';

describe('DeactivateUser', () => {
  // Pasa a Inactivo y cierra sus 2 sesiones; no vuelve a iniciar sesión (AC-08)
  it('test_deactivate_user_cierra_todas_sus_sesiones', async () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com', password: 'clave-admin' });
    ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', role: 'editor', password: 'clave-bruno' });
    const first = await ctx.login.execute({ email: 'bruno@empresa.com', password: 'clave-bruno' });
    const second = await ctx.login.execute({ email: 'bruno@empresa.com', password: 'clave-bruno' });
    const adminSession = await ctx.login.execute({ email: 'admin@empresa.com', password: 'clave-admin' });

    const result = ctx.deactivateUser.execute(admin, 'u-bruno');

    expect(result).toEqual({
      id: 'u-bruno',
      name: 'Ana Pérez',
      email: 'bruno@empresa.com',
      role: 'editor',
      status: 'inactivo',
    });
    expect(ctx.users.findById('u-bruno')?.status).toBe('inactivo');
    expect(ctx.sessions.all().map((s) => s.userId)).toEqual(['u-admin']);
    expect(() => ctx.authenticateSession.execute(first.token)).toThrow(Unauthenticated);
    expect(() => ctx.authenticateSession.execute(second.token)).toThrow(Unauthenticated);
    expect(ctx.authenticateSession.execute(adminSession.token).id).toBe('u-admin');
    await expect(
      ctx.login.execute({ email: 'bruno@empresa.com', password: 'clave-bruno' }),
    ).rejects.toBeInstanceOf(InvalidCredentials);
  });

  // El único Admin Activo no se puede dar de baja: sigue Activo y Admin (AC-10)
  it('test_deactivate_user_ultimo_admin_rechazado', async () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com', password: 'clave-admin' });
    await ctx.login.execute({ email: 'admin@empresa.com', password: 'clave-admin' });

    expect(() => ctx.deactivateUser.execute(admin, 'u-admin')).toThrow(LastActiveAdmin);

    const stored = ctx.users.findById('u-admin');
    expect(stored?.status).toBe('activo');
    expect(stored?.role).toBe('admin');
    expect(ctx.sessions.all()).toHaveLength(1);
  });

  // Con 2 Admin Activos la baja se realiza (AC-11)
  it('test_deactivate_user_con_dos_admins_se_realiza', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-admin-2', email: 'admin2@empresa.com' });

    const result = ctx.deactivateUser.execute(admin, 'u-admin-2');

    expect(result.status).toBe('inactivo');
    expect(ctx.users.countActiveAdmins()).toBe(1);
  });

  it('dar de baja a un usuario Inactivo no cambia nada y lo devuelve (idempotente)', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    const inactive = ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', role: 'editor', status: 'inactivo' });

    const result = ctx.deactivateUser.execute(admin, 'u-bruno');

    expect(result.status).toBe('inactivo');
    expect(ctx.users.findById('u-bruno')).toBe(inactive);
  });

  it('usuario inexistente: UserNotFound', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });

    expect(() => ctx.deactivateUser.execute(admin, 'no-existe')).toThrow(UserNotFound);
  });

  it('Editor y Consulta no pueden dar de baja (Forbidden, nada cambia)', () => {
    const ctx = createAuthContext();
    ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-admin-2', email: 'admin2@empresa.com' });
    const editor = ctx.seedUser({ id: 'u-editor', email: 'editor@empresa.com', role: 'editor' });
    const consulta = ctx.seedUser({ id: 'u-consulta', email: 'consulta@empresa.com', role: 'consulta' });

    expect(() => ctx.deactivateUser.execute(editor, 'u-admin')).toThrow(Forbidden);
    expect(() => ctx.deactivateUser.execute(consulta, 'u-admin')).toThrow(Forbidden);
    expect(ctx.users.countActiveAdmins()).toBe(2);
  });

  it('un actor que ya no existe o está Inactivo es rechazado dentro de la transacción', () => {
    const ctx = createAuthContext();
    ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', role: 'editor' });
    const exAdmin = ctx.seedUser({ id: 'u-ex', email: 'ex@empresa.com', status: 'inactivo' });

    expect(() => ctx.deactivateUser.execute(exAdmin, 'u-bruno')).toThrow(Forbidden);
    expect(() => ctx.deactivateUser.execute({ id: 'fantasma', role: 'admin' }, 'u-bruno')).toThrow(Forbidden);
    expect(ctx.users.findById('u-bruno')?.status).toBe('activo');
  });
});
