import { describe, expect, it, vi } from 'vitest';
import { InvalidCredentials, InvalidResetToken } from '../../../src/application/auth/errors.js';
import { WeakPassword } from '../../../src/domain/user/errors.js';
import { createPasswordResetContext } from '../../support/passwordResetContext.js';

const OLD = 'clave-vieja-1';
const NEW = 'clave-nueva-22';

/** Un usuario Activo con 2 sesiones abiertas que ya pidió la recuperación. */
async function withIssuedToken() {
  const ctx = createPasswordResetContext();
  const user = ctx.seedUser({ id: 'u-ana', email: 'ana@empresa.com', password: OLD });
  await ctx.login.execute({ email: 'ana@empresa.com', password: OLD });
  await ctx.login.execute({ email: 'ana@empresa.com', password: OLD });
  expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
  await ctx.emailSender.settled();
  return { ctx, user, token: ctx.lastSentToken() };
}

function sessionsOf(ctx: ReturnType<typeof createPasswordResetContext>, userId: string) {
  return [...ctx.sessions.snapshot().values()].filter((s) => s.userId === userId);
}

describe('ResetPasswordWithToken', () => {
  // Defensa en profundidad: si `markUsed` no marca el token, no se cambia nada (W4)
  it('markUsed que no marca el token rechaza sin cambiar la contraseña', async () => {
    const { ctx, user, token } = await withIssuedToken();
    const markUsed = vi.spyOn(ctx.resetTokens, 'markUsed').mockReturnValue(false);

    await expect(ctx.resetPasswordWithToken.execute({ token, newPassword: NEW })).rejects.toBeInstanceOf(
      InvalidResetToken,
    );

    expect(markUsed).toHaveBeenCalledTimes(1);
    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(user.passwordHash);
    expect(sessionsOf(ctx, 'u-ana')).toHaveLength(2);
    expect(ctx.resetTokens.findByTokenHash(ctx.resetTokenGenerator.hash(token))?.invalidatedAt).toBeNull();
  });

  // 2 sesiones → 0, la nueva verifica con el hasher y el token queda usado (AC-11)
  it('test_reset_cambia_contraseña_y_cierra_sesiones', async () => {
    const { ctx, token } = await withIssuedToken();
    expect(sessionsOf(ctx, 'u-ana')).toHaveLength(2);

    await ctx.resetPasswordWithToken.execute({ token, newPassword: NEW });

    const stored = ctx.users.findById('u-ana');
    expect(await ctx.hasher.verify(stored?.passwordHash ?? '', NEW)).toBe(true);
    expect(await ctx.hasher.verify(stored?.passwordHash ?? '', OLD)).toBe(false);
    expect(stored?.passwordHash).not.toBe(NEW);
    expect(ctx.hasher.hashCalls).toEqual([NEW]);
    expect(sessionsOf(ctx, 'u-ana')).toHaveLength(0);

    const row = ctx.resetTokens.findByTokenHash(ctx.resetTokenGenerator.hash(token));
    expect(row?.usedAt).not.toBeNull();
    expect(row?.isUsable(ctx.clock.now())).toBe(false);

    expect((await ctx.login.execute({ email: 'ana@empresa.com', password: NEW })).user.id).toBe('u-ana');
    await expect(ctx.login.execute({ email: 'ana@empresa.com', password: OLD })).rejects.toBeInstanceOf(
      InvalidCredentials,
    );
    // Un segundo uso del mismo token se rechaza.
    await expect(ctx.resetPasswordWithToken.execute({ token, newPassword: 'otra-clave-33' })).rejects.toBeInstanceOf(
      InvalidResetToken,
    );
  });

  // 7 caracteres: WeakPassword, hash sin cambios y Check sigue OK (AC-10)
  it('test_reset_contraseña_corta_rechazada_token_sigue_valido', async () => {
    const { ctx, user, token } = await withIssuedToken();

    await expect(ctx.resetPasswordWithToken.execute({ token, newPassword: '1234567' })).rejects.toBeInstanceOf(
      WeakPassword,
    );

    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(user.passwordHash);
    expect(ctx.hasher.hashCalls).toEqual([]);
    expect(sessionsOf(ctx, 'u-ana')).toHaveLength(2);
    expect(() => { ctx.checkPasswordResetToken.execute(token); }).not.toThrow();
  });

  // 1025 caracteres: WeakPassword (sad path)
  it('test_reset_contraseña_larga_rechazada', async () => {
    const { ctx, user, token } = await withIssuedToken();

    await expect(
      ctx.resetPasswordWithToken.execute({ token, newPassword: 'a'.repeat(1025) }),
    ).rejects.toBeInstanceOf(WeakPassword);

    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(user.passwordHash);
    expect(() => { ctx.checkPasswordResetToken.execute(token); }).not.toThrow();
  });

  // Vence con la pantalla abierta: InvalidResetToken y el hash no cambia (AC-09)
  it('test_reset_token_vencido_invalido_no_cambia', async () => {
    const { ctx, user, token } = await withIssuedToken();

    // Al abrir la pantalla (9 minutos) el token sirve...
    ctx.clock.advance(9 * 60_000);
    expect(() => { ctx.checkPasswordResetToken.execute(token); }).not.toThrow();

    // ...y vence mientras se escribe la contraseña nueva.
    ctx.clock.advance(2 * 60_000);
    await expect(ctx.resetPasswordWithToken.execute({ token, newPassword: NEW })).rejects.toBeInstanceOf(
      InvalidResetToken,
    );
    expect(ctx.users.findById('u-ana')?.passwordHash).toBe(user.passwordHash);
    expect(ctx.hasher.hashCalls).toEqual([]);
    expect(sessionsOf(ctx, 'u-ana')).toHaveLength(2);

    // Vence justo mientras se calcula el hash: lo detecta la relectura dentro de la transacción.
    const again = await withIssuedToken();
    again.ctx.clock.advance(9 * 60_000 + 59_000);
    again.ctx.hasher.onHash = () => {
      again.ctx.clock.advance(2_000);
    };
    await expect(
      again.ctx.resetPasswordWithToken.execute({ token: again.token, newPassword: NEW }),
    ).rejects.toBeInstanceOf(InvalidResetToken);
    expect(again.ctx.users.findById('u-ana')?.passwordHash).toBe(again.user.passwordHash);
    expect(sessionsOf(again.ctx, 'u-ana')).toHaveLength(2);
    expect(
      again.ctx.resetTokens.findByTokenHash(again.ctx.resetTokenGenerator.hash(again.token))?.usedAt,
    ).toBeNull();
  });
});
