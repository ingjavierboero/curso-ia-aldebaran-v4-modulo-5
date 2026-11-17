import { describe, expect, it } from 'vitest';
import { Forbidden } from '../../../../src/domain/auth/errors.js';
import { Email } from '../../../../src/domain/shared/Email.js';
import {
  EmailAlreadyInUse,
  InvalidName,
  InvalidRole,
  LastActiveAdmin,
  UserNotFound,
} from '../../../../src/domain/user/errors.js';
import { createAuthContext } from '../../../support/authContext.js';

describe('UpdateUser', () => {
  // Nombre y email nuevos quedan guardados y el usuario inicia sesión con el email nuevo (AC-06)
  it('test_update_user_cambia_nombre_y_email', async () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-bruno', name: 'Bruno', email: 'bruno@empresa.com', role: 'editor', password: 'clave-bruno' });

    const updated = ctx.updateUser.execute(admin, 'u-bruno', {
      name: ' Bruno Pérez ',
      email: 'Bruno.Perez@Empresa.com',
    });

    expect(updated).toEqual({
      id: 'u-bruno',
      name: 'Bruno Pérez',
      email: 'bruno.perez@empresa.com',
      role: 'editor',
      status: 'activo',
    });
    expect(ctx.listUsers.execute(admin)).toContainEqual(updated);
    expect(ctx.users.findByEmail(Email.create('bruno@empresa.com'))).toBeNull();
    expect(ctx.users.findById('u-bruno')?.passwordHash).toBe('hashed:clave-bruno');

    const session = await ctx.login.execute({ email: 'bruno.perez@empresa.com', password: 'clave-bruno' });
    expect(session.user).toEqual(updated);
  });

  it('acepta el mismo email del propio usuario con otras mayúsculas', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', role: 'editor' });

    const updated = ctx.updateUser.execute(admin, 'u-bruno', { email: 'BRUNO@empresa.com' });

    expect(updated.email).toBe('bruno@empresa.com');
  });

  // Ana@Empresa.com ya es de otro usuario: rechazado y conserva su email (AC-04)
  it('test_update_user_email_duplicado_rechazado', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-ana', email: 'ana@empresa.com', role: 'consulta' });
    ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', role: 'editor' });

    expect(() => ctx.updateUser.execute(admin, 'u-bruno', { name: 'Otro', email: 'Ana@Empresa.com' })).toThrow(
      EmailAlreadyInUse,
    );

    const bruno = ctx.users.findById('u-bruno');
    expect(bruno?.email.value).toBe('bruno@empresa.com');
    expect(bruno?.name).toBe('Ana Pérez');
  });

  // El perfil cambia de Editor a Consulta (AC-07)
  it('test_update_user_cambia_perfil', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', role: 'editor' });

    const updated = ctx.updateUser.execute(admin, 'u-bruno', { role: 'consulta' });

    expect(updated.role).toBe('consulta');
    expect(ctx.users.findById('u-bruno')?.role).toBe('consulta');
  });

  // Usuario inexistente: UserNotFound
  it('test_update_user_inexistente_rechazado', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });

    expect(() => ctx.updateUser.execute(admin, 'no-existe', { name: 'Nadie' })).toThrow(UserNotFound);
  });

  // Cambiar a Editor al único Admin Activo: LastActiveAdmin, sigue Admin (AC-10)
  it('test_update_user_ultimo_admin_rechazado', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-admin-baja', email: 'baja@empresa.com', status: 'inactivo' });

    expect(() => ctx.updateUser.execute(admin, 'u-admin', { role: 'editor' })).toThrow(LastActiveAdmin);

    const stored = ctx.users.findById('u-admin');
    expect(stored?.role).toBe('admin');
    expect(stored?.status).toBe('activo');
  });

  it('valida nombre y perfil antes de tocar nada', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-bruno', email: 'bruno@empresa.com', role: 'editor' });

    expect(() => ctx.updateUser.execute(admin, 'u-bruno', { name: '' })).toThrow(InvalidName);
    expect(() => ctx.updateUser.execute(admin, 'u-bruno', { role: 'jefe' })).toThrow(InvalidRole);
    expect(ctx.users.findById('u-bruno')?.role).toBe('editor');
  });

  it('Editor y Consulta no pueden modificar usuarios (Forbidden, nada cambia)', () => {
    const ctx = createAuthContext();
    ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    const editor = ctx.seedUser({ id: 'u-editor', email: 'editor@empresa.com', role: 'editor' });
    const consulta = ctx.seedUser({ id: 'u-consulta', email: 'consulta@empresa.com', role: 'consulta' });

    expect(() => ctx.updateUser.execute(editor, 'u-editor', { role: 'admin' })).toThrow(Forbidden);
    expect(() => ctx.updateUser.execute(consulta, 'u-admin', { name: 'X' })).toThrow(Forbidden);
    expect(ctx.users.findById('u-editor')?.role).toBe('editor');
    expect(ctx.users.findById('u-admin')?.name).toBe('Ana Pérez');
  });

  // FR-12 / W-2 de VERIFY: el actor se relee dentro de la transacción. Con un actor que trae el
  // perfil Admin "viejo" pero ya fue degradado o dado de baja, la modificación no se realiza.
  it('test_update_user_actor_desactualizado_rechazado', () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-otro-admin', email: 'otro@empresa.com' });
    ctx.seedUser({ id: 'u-bruno', name: 'Bruno', email: 'bruno@empresa.com', role: 'editor' });

    ctx.users.update(admin.withProfile({ name: admin.name, email: admin.email, role: 'editor' }));
    expect(() => ctx.updateUser.execute(admin, 'u-bruno', { name: 'Bruno Nuevo' })).toThrow(Forbidden);

    ctx.users.update(admin.deactivated());
    expect(() => ctx.updateUser.execute(admin, 'u-bruno', { role: 'admin' })).toThrow(Forbidden);

    expect(ctx.users.findById('u-bruno')?.name).toBe('Bruno');
    expect(ctx.users.findById('u-bruno')?.role).toBe('editor');
  });
});
