import { describe, expect, it } from 'vitest';
import { InvalidResetToken } from '../../../src/application/auth/errors.js';
import { createPasswordResetContext } from '../../support/passwordResetContext.js';

/** Un usuario Activo que ya pidió la recuperación: devuelve el token del email. */
async function withIssuedToken() {
  const ctx = createPasswordResetContext();
  const user = ctx.seedUser({ id: 'u-ana', email: 'ana@empresa.com', password: 'clave-vieja-1' });
  expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
  await ctx.emailSender.settled();
  return { ctx, user, token: ctx.lastSentToken() };
}

describe('CheckPasswordResetToken', () => {
  // A los 9 minutos el token sirve (AC-05)
  it('test_check_token_valido_a_los_9_minutos', async () => {
    const { ctx, token } = await withIssuedToken();

    ctx.clock.advance(9 * 60_000);

    expect(() => { ctx.checkPasswordResetToken.execute(token); }).not.toThrow();
  });

  // A los 11 minutos: InvalidResetToken (AC-06)
  it('test_check_token_vencido_invalido', async () => {
    const { ctx, token } = await withIssuedToken();

    ctx.clock.advance(11 * 60_000);

    expect(() => { ctx.checkPasswordResetToken.execute(token); }).toThrow(InvalidResetToken);
    expect(() => { ctx.checkPasswordResetToken.execute(token); }).toThrow('El enlace no es válido o venció');
  });

  // Después de un cambio exitoso: InvalidResetToken (AC-07)
  it('test_check_token_usado_invalido', async () => {
    const { ctx, token } = await withIssuedToken();

    await ctx.resetPasswordWithToken.execute({ token, newPassword: 'clave-nueva-22' });

    expect(() => { ctx.checkPasswordResetToken.execute(token); }).toThrow(InvalidResetToken);
  });

  // Formato inválido: 10 caracteres, con `/`, o sin hash guardado (sad path)
  it('test_check_token_formato_invalido', async () => {
    const { ctx, token } = await withIssuedToken();

    expect(() => { ctx.checkPasswordResetToken.execute('abcdefghij'); }).toThrow(InvalidResetToken);
    expect(() => { ctx.checkPasswordResetToken.execute(`${token.slice(0, 42)}/`); }).toThrow(InvalidResetToken);
    expect(() => { ctx.checkPasswordResetToken.execute(`${token}A`); }).toThrow(InvalidResetToken);
    // Formato válido pero inexistente.
    expect(() => { ctx.checkPasswordResetToken.execute('B'.repeat(43)); }).toThrow(InvalidResetToken);
    // Con formato inválido ni siquiera se busca: no se calcula el hash del texto recibido.
    const hashCalls: string[] = [];
    const original = ctx.resetTokenGenerator.hash.bind(ctx.resetTokenGenerator);
    ctx.resetTokenGenerator.hash = (t: string) => {
      hashCalls.push(t);
      return original(t);
    };
    expect(() => { ctx.checkPasswordResetToken.execute('con/barra'); }).toThrow(InvalidResetToken);
    expect(hashCalls).toEqual([]);
  });

  // Usuario desactivado después del pedido: InvalidResetToken (sad path)
  it('test_check_usuario_inactivo_invalido', async () => {
    const { ctx, user, token } = await withIssuedToken();

    ctx.users.update(user.deactivated());

    expect(() => { ctx.checkPasswordResetToken.execute(token); }).toThrow(InvalidResetToken);
  });
});
