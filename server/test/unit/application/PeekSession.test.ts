import { describe, expect, it } from 'vitest';
import { Session } from '../../../src/domain/auth/Session.js';
import { createAuthContext } from '../../support/authContext.js';

const HOUR = 60 * 60 * 1000;

async function loggedIn() {
  const ctx = createAuthContext();
  const user = ctx.seedUser({ email: 'admin@empresa.com', password: 'contraseña-segura' });
  const { token } = await ctx.login.execute({ email: 'admin@empresa.com', password: 'contraseña-segura' });
  return { ctx, user, token };
}

describe('PeekSession', () => {
  // AC-04: token inválido, vencido o de usuario Inactivo → null, y la sesión no se modifica (R-06)
  it('test_peek_session_token_invalido_rechazado_devuelve_null', async () => {
    // inexistente y vacío
    const empty = createAuthContext();
    expect(empty.peekSession.execute('token-que-no-existe')).toBeNull();
    expect(empty.peekSession.execute('')).toBeNull();

    // vencido: 24 h sin actividad; la sesión no se borra ni se renueva
    const { ctx, token } = await loggedIn();
    const [before] = ctx.sessions.all();
    ctx.clock.advance(24 * HOUR);
    expect(ctx.peekSession.execute(token)).toBeNull();
    expect(ctx.sessions.all()).toEqual([before]);

    // usuario Inactivo: la sesión no se borra
    const inactive = createAuthContext();
    inactive.seedUser({ id: 'u-1', email: 'admin@empresa.com', status: 'inactivo' });
    const generated = inactive.tokens.generate();
    const now = inactive.clock.now();
    const session = new Session({
      id: 's-1',
      userId: 'u-1',
      tokenHash: generated.tokenHash,
      createdAt: now,
      lastActivityAt: now,
    });
    inactive.sessions.insert(session);
    expect(inactive.peekSession.execute(generated.token)).toBeNull();
    expect(inactive.sessions.all()).toEqual([session]);

    // usuario inexistente: la sesión no se borra
    const orphan = createAuthContext();
    const orphanToken = orphan.tokens.generate();
    const orphanSession = new Session({
      id: 's-2',
      userId: 'no-existe',
      tokenHash: orphanToken.tokenHash,
      createdAt: now,
      lastActivityAt: now,
    });
    orphan.sessions.insert(orphanSession);
    expect(orphan.peekSession.execute(orphanToken.token)).toBeNull();
    expect(orphan.sessions.all()).toEqual([orphanSession]);
  });

  // AC-03 / R-06: con sesión válida devuelve el usuario sin renovar last_activity_at
  it('test_peek_session_no_renueva_last_activity', async () => {
    const { ctx, user, token } = await loggedIn();
    const loginAt = ctx.clock.now();
    ctx.clock.advance(23 * HOUR);

    expect(ctx.peekSession.execute(token)).toEqual({
      id: user.id,
      name: 'Ana Pérez',
      email: 'admin@empresa.com',
      role: 'admin',
      status: 'activo',
    });
    const [session] = ctx.sessions.all();
    expect(session?.lastActivityAt).toEqual(loginAt);

    // como no renovó, a las 24 h desde el login la sesión ya venció
    ctx.clock.advance(1 * HOUR);
    expect(ctx.peekSession.execute(token)).toBeNull();
  });
});
