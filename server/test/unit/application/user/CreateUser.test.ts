import { describe, expect, it } from 'vitest';
import { Forbidden } from '../../../../src/domain/auth/errors.js';
import { InvalidEmail } from '../../../../src/domain/shared/errors.js';
import { EmailAlreadyInUse, InvalidName, InvalidRole, WeakPassword } from '../../../../src/domain/user/errors.js';
import { createAuthContext } from '../../../support/authContext.js';

const VALID = { name: 'Bruno Editor', email: 'bruno@empresa.com', role: 'editor', password: '12345678' };

describe('CreateUser', () => {
  // El alta queda Activa, con el perfil pedido, y el usuario inicia sesión (AC-02)
  it('test_create_user_queda_activo_con_perfil', async () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });

    const created = await ctx.createUser.execute(admin, {
      name: '  Bruno Editor ',
      email: ' Bruno@Empresa.com',
      role: 'editor',
      password: '12345678',
    });

    expect(created).toEqual({
      id: 'id-1',
      name: 'Bruno Editor',
      email: 'bruno@empresa.com',
      role: 'editor',
      status: 'activo',
    });
    expect(Object.keys(created)).not.toContain('passwordHash');
    const stored = ctx.users.findById('id-1');
    expect(stored?.passwordHash).toBe('hashed:12345678');
    expect(stored?.createdAt).toEqual(ctx.clock.now());
    expect(ctx.hasher.hashCalls).toEqual(['12345678']);

    const session = await ctx.login.execute({ email: 'bruno@empresa.com', password: '12345678' });
    expect(session.user).toEqual(created);
  });

  // Ana@Empresa.com con ana@empresa.com existente es rechazado y no se crea nada (AC-03)
  it('test_create_user_email_duplicado_rechazado', async () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-ana', email: 'ana@empresa.com', role: 'consulta' });

    await expect(
      ctx.createUser.execute(admin, { ...VALID, email: 'Ana@Empresa.com' }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUse);
    expect(ctx.users.countAll()).toBe(2);
  });

  // 7 caracteres: WeakPassword, sin hashear y sin crear (AC-05)
  it('test_create_user_contrasena_corta_rechazado', async () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });

    await expect(
      ctx.createUser.execute(admin, { ...VALID, password: '1234567' }),
    ).rejects.toBeInstanceOf(WeakPassword);
    expect(ctx.hasher.hashCalls).toHaveLength(0);
    expect(ctx.users.countAll()).toBe(1);
  });

  // Nombre vacío, de 101 caracteres, email inválido, perfil desconocido (AC-19)
  it('test_create_user_nombre_o_email_invalido_rechazado', async () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });

    await expect(ctx.createUser.execute(admin, { ...VALID, name: '   ' })).rejects.toBeInstanceOf(InvalidName);
    await expect(
      ctx.createUser.execute(admin, { ...VALID, name: 'x'.repeat(101) }),
    ).rejects.toBeInstanceOf(InvalidName);
    await expect(
      ctx.createUser.execute(admin, { ...VALID, email: 'bruno@empresa' }),
    ).rejects.toBeInstanceOf(InvalidEmail);
    await expect(
      ctx.createUser.execute(admin, { ...VALID, role: 'superadmin' }),
    ).rejects.toBeInstanceOf(InvalidRole);

    expect(ctx.hasher.hashCalls).toHaveLength(0);
    expect(ctx.users.countAll()).toBe(1);
  });

  // Consulta: Forbidden y nada se crea (AC-14)
  it('test_create_user_consulta_no_autorizado', async () => {
    const ctx = createAuthContext();
    ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    const consulta = ctx.seedUser({ id: 'u-consulta', email: 'consulta@empresa.com', role: 'consulta' });
    const editor = ctx.seedUser({ id: 'u-editor', email: 'editor@empresa.com', role: 'editor' });

    await expect(ctx.createUser.execute(consulta, VALID)).rejects.toBeInstanceOf(Forbidden);
    await expect(ctx.createUser.execute(editor, VALID)).rejects.toBeInstanceOf(Forbidden);

    expect(ctx.hasher.hashCalls).toHaveLength(0);
    expect(ctx.users.countAll()).toBe(3);
  });

  // El actor deja de ser Admin entre el chequeo y la transacción: Forbidden y nada se crea (AC-07, FR-12)
  it('test_create_user_actor_degradado_durante_el_hash_rechazado', async () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-otro-admin', email: 'otro@empresa.com' });
    ctx.hasher.onHash = () => {
      ctx.users.update(admin.withProfile({ name: admin.name, email: admin.email, role: 'editor' }));
    };

    await expect(ctx.createUser.execute(admin, VALID)).rejects.toBeInstanceOf(Forbidden);

    expect(ctx.hasher.hashCalls).toHaveLength(1);
    expect(ctx.users.countAll()).toBe(2);
    expect(ctx.users.findByEmail(admin.email)?.role).toBe('editor');
  });

  it('un actor dado de baja durante el hash tampoco completa el alta', async () => {
    const ctx = createAuthContext();
    const admin = ctx.seedUser({ id: 'u-admin', email: 'admin@empresa.com' });
    ctx.seedUser({ id: 'u-otro-admin', email: 'otro@empresa.com' });
    ctx.hasher.onHash = () => {
      ctx.users.update(admin.deactivated());
    };

    await expect(ctx.createUser.execute(admin, VALID)).rejects.toBeInstanceOf(Forbidden);
    expect(ctx.users.countAll()).toBe(2);
  });
});
