import { describe, expect, it } from 'vitest';
import { InvalidCredentials } from '../../src/application/auth/errors.js';
import { InvalidEmail } from '../../src/domain/user/errors.js';
import { createAuthContext, DUMMY_HASH } from '../support/authContext.js';

describe('Login', () => {
  // Login con email y contraseña correctos de un usuario Activo devuelve token y PublicUser
  it('test_login_credenciales_correctas_usuario_activo_devuelve_token_y_public_user', async () => {
    const ctx = createAuthContext();
    const user = ctx.seedUser({ email: 'admin@empresa.com', password: 'contraseña-segura' });

    const result = await ctx.login.execute({ email: 'admin@empresa.com', password: 'contraseña-segura' });

    expect(result.token).toBe('token-1');
    expect(result.user).toEqual({
      id: user.id,
      name: 'Ana Pérez',
      email: 'admin@empresa.com',
      role: 'admin',
      status: 'activo',
    });
    const stored = ctx.sessions.all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.userId).toBe(user.id);
    expect(stored[0]?.tokenHash).toBe(ctx.tokens.hash('token-1'));
    expect(stored[0]?.tokenHash).not.toBe('token-1');
    expect(stored[0]?.createdAt).toEqual(ctx.clock.now());
    expect(stored[0]?.lastActivityAt).toEqual(ctx.clock.now());
  });

  it('Login guarda createdAt y lastActivityAt como instancias distintas', async () => {
    const ctx = createAuthContext();
    ctx.seedUser({ email: 'admin@empresa.com', password: 'contraseña-segura' });

    await ctx.login.execute({ email: 'admin@empresa.com', password: 'contraseña-segura' });

    const stored = ctx.sessions.all()[0];
    expect(stored?.createdAt).not.toBe(stored?.lastActivityAt);
    const original = stored?.createdAt.toISOString();
    stored?.lastActivityAt.setTime(0);
    expect(stored?.createdAt.toISOString()).toBe(original);
  });

  // Login con Admin@Empresa.com encuentra al usuario admin@empresa.com
  it('test_login_con_email_en_mayusculas_encuentra_al_usuario', async () => {
    const ctx = createAuthContext();
    const user = ctx.seedUser({ email: 'admin@empresa.com', password: 'contraseña-segura' });

    const result = await ctx.login.execute({
      email: '  Admin@Empresa.com ',
      password: 'contraseña-segura',
    });

    expect(result.user.id).toBe(user.id);
    expect(result.user.email).toBe('admin@empresa.com');
  });

  // Login con contraseña incorrecta es rechazado con InvalidCredentials
  it('test_login_contrasena_incorrecta_rechazado_invalid_credentials', async () => {
    const ctx = createAuthContext();
    ctx.seedUser({ email: 'admin@empresa.com', password: 'contraseña-segura' });

    await expect(
      ctx.login.execute({ email: 'admin@empresa.com', password: 'otra-contraseña' }),
    ).rejects.toBeInstanceOf(InvalidCredentials);
    expect(ctx.sessions.all()).toHaveLength(0);
  });

  // Login con email inexistente es rechazado con InvalidCredentials y verifica contra el hash dummy
  it('test_login_email_inexistente_rechazado_y_verifica_contra_hash_dummy', async () => {
    const ctx = createAuthContext();
    ctx.seedUser({ email: 'admin@empresa.com', password: 'contraseña-segura' });

    await expect(
      ctx.login.execute({ email: 'nadie@empresa.com', password: 'contraseña-segura' }),
    ).rejects.toBeInstanceOf(InvalidCredentials);
    expect(ctx.hasher.verifyCalls).toEqual([{ hash: DUMMY_HASH, plain: 'contraseña-segura' }]);
    expect(ctx.sessions.all()).toHaveLength(0);
  });

  // Login de usuario Inactivo es rechazado con InvalidCredentials
  it('test_login_usuario_inactivo_rechazado_invalid_credentials', async () => {
    const ctx = createAuthContext();
    ctx.seedUser({ email: 'inactivo@empresa.com', password: 'contraseña-segura', status: 'inactivo' });

    const attempt = ctx.login.execute({ email: 'inactivo@empresa.com', password: 'contraseña-segura' });

    await expect(attempt).rejects.toBeInstanceOf(InvalidCredentials);
    await expect(attempt).rejects.toThrow('Email o contraseña incorrectos');
    expect(ctx.sessions.all()).toHaveLength(0);
  });

  it('Login con email de formato inválido es rechazado con InvalidEmail y no crea sesión', async () => {
    const ctx = createAuthContext();

    await expect(
      ctx.login.execute({ email: 'no-es-un-email', password: 'contraseña-segura' }),
    ).rejects.toBeInstanceOf(InvalidEmail);
    expect(ctx.sessions.all()).toHaveLength(0);
  });
});
