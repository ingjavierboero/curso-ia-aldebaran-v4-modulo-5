import { describe, expect, it } from 'vitest';
import { Unauthenticated } from '../../src/application/auth/errors.js';
import { createAuthContext } from '../support/authContext.js';

describe('Logout', () => {
  // Logout borra la sesión y AuthenticateSession posterior es rechazado (no autorizado)
  it('test_logout_borra_la_sesion_y_authenticate_session_posterior_es_rechazado', async () => {
    const ctx = createAuthContext();
    ctx.seedUser({ email: 'admin@empresa.com', password: 'contraseña-segura' });
    const { token } = await ctx.login.execute({
      email: 'admin@empresa.com',
      password: 'contraseña-segura',
    });
    expect(ctx.sessions.all()).toHaveLength(1);

    ctx.logout.execute(token);

    expect(ctx.sessions.all()).toHaveLength(0);
    expect(() => ctx.authenticateSession.execute(token)).toThrow(Unauthenticated);
    // Idempotente: repetir el logout con el mismo token no falla.
    expect(() => ctx.logout.execute(token)).not.toThrow();
  });
});
