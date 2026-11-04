import { describe, expect, it } from 'vitest';
import { Unauthenticated } from '../../src/application/auth/errors.js';
import { Session } from '../../src/domain/auth/Session.js';
import { createAuthContext } from '../support/authContext.js';

const HOUR = 60 * 60 * 1000;

async function loggedIn() {
  const ctx = createAuthContext();
  const user = ctx.seedUser({ email: 'admin@empresa.com', password: 'contraseña-segura' });
  const { token } = await ctx.login.execute({ email: 'admin@empresa.com', password: 'contraseña-segura' });
  return { ctx, user, token };
}

describe('AuthenticateSession', () => {
  it('AuthenticateSession con última actividad hace 24 h es rechazado (Unauthenticated) y borra la sesión', async () => {
    const { ctx, token } = await loggedIn();
    ctx.clock.advance(24 * HOUR);

    expect(() => ctx.authenticateSession.execute(token)).toThrow(Unauthenticated);
    expect(ctx.sessions.all()).toHaveLength(0);
  });

  it('AuthenticateSession con última actividad hace 23 h devuelve el usuario y actualiza last_activity_at', async () => {
    const { ctx, user, token } = await loggedIn();
    ctx.clock.advance(23 * HOUR);

    const authenticated = ctx.authenticateSession.execute(token);

    expect(authenticated).toEqual({
      id: user.id,
      name: 'Ana Pérez',
      email: 'admin@empresa.com',
      role: 'admin',
      status: 'activo',
    });
    const [session] = ctx.sessions.all();
    expect(session?.lastActivityAt).toEqual(ctx.clock.now());

    // La expiración es deslizante: 23 h más desde la última actividad sigue valiendo.
    ctx.clock.advance(23 * HOUR);
    expect(ctx.authenticateSession.execute(token).id).toBe(user.id);
  });

  it('AuthenticateSession con token inexistente es rechazado (no autorizado)', () => {
    const ctx = createAuthContext();

    expect(() => ctx.authenticateSession.execute('token-que-no-existe')).toThrow(Unauthenticated);
  });

  it('AuthenticateSession de un usuario que pasó a Inactivo es rechazado y borra la sesión', () => {
    const ctx = createAuthContext();
    ctx.seedUser({ id: 'u-1', email: 'admin@empresa.com', status: 'inactivo' });
    const { token, tokenHash } = ctx.tokens.generate();
    const now = ctx.clock.now();
    ctx.sessions.insert(
      // Sesión creada cuando el usuario todavía estaba Activo.
      new Session({
        id: 's-1',
        userId: 'u-1',
        tokenHash,
        createdAt: now,
        lastActivityAt: now,
      }),
    );

    expect(() => ctx.authenticateSession.execute(token)).toThrow(Unauthenticated);
    expect(ctx.sessions.all()).toHaveLength(0);
  });
});
