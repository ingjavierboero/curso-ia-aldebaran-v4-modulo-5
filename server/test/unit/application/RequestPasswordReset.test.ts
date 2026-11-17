import { describe, expect, it } from 'vitest';
import { createPasswordResetContext } from '../../support/passwordResetContext.js';

const SUBJECT = 'Recuperación de contraseña de Aldebaran';
const NOTICE = 'El enlace vence en 10 minutos. Si no pediste el cambio, ignorá este email.';

function withActiveUser(options: { appUrl?: string } = {}) {
  const ctx = createPasswordResetContext(options);
  const user = ctx.seedUser({ id: 'u-ana', email: 'ana@empresa.com' });
  return { ctx, user };
}

describe('RequestPasswordReset', () => {
  // Un email a user.email, asunto fijo, URL con el token y aviso de 10 minutos; en la base solo el hash (AC-01)
  it('test_request_usuario_activo_envia_url_con_token', async () => {
    const { ctx } = withActiveUser();

    expect(ctx.requestPasswordReset.execute('  Ana@Empresa.com ')).toBe('issued');
    await ctx.emailSender.settled();

    expect(ctx.emailSender.sent).toHaveLength(1);
    const [message] = ctx.emailSender.sent;
    expect(message?.to).toBe('ana@empresa.com');
    expect(message?.subject).toBe(SUBJECT);
    const token = ctx.lastSentToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(message?.text).toContain(`http://localhost:5173/recuperar/${token}`);
    expect(message?.text).toContain(NOTICE);

    // En la base: un token, guardado solo como hash.
    const stored = ctx.resetTokens.findByTokenHash(ctx.resetTokenGenerator.hash(token));
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.userId).toBe('u-ana');
    expect(stored?.isUsable(ctx.clock.now())).toBe(true);
    const rows = [...ctx.resetTokens.snapshot().values()];
    expect(rows).toHaveLength(1);
    // Ninguna columna guardada contiene el token, ni siquiera como parte de otro texto.
    for (const row of rows) {
      for (const value of Object.values(row) as unknown[]) {
        const text = value instanceof Date ? value.toISOString() : String(value);
        expect(text).not.toContain(token);
      }
    }

    // El log registra la entrega, sin token ni URL.
    expect(ctx.resetLog.deliveries).toEqual([{ userId: 'u-ana', email: 'ana@empresa.com' }]);
    expect(ctx.resetLog.failures).toEqual([]);
    expect(JSON.stringify(ctx.resetLog)).not.toContain(token);
  });

  // La URL usa la dirección configurada (AC-02)
  it('test_request_usa_app_url_configurada', async () => {
    const { ctx } = withActiveUser({ appUrl: 'https://aldebaran.empresa.com' });

    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
    await ctx.emailSender.settled();

    const token = ctx.lastSentToken();
    expect(ctx.emailSender.sent[0]?.text).toContain(`https://aldebaran.empresa.com/recuperar/${token}`);
    expect(ctx.emailSender.sent[0]?.text).not.toContain('localhost');
  });

  // Email sin usuario: no_user, 0 emails, 0 tokens (AC-03)
  it('test_request_email_inexistente_no_envia', async () => {
    const { ctx } = withActiveUser();

    expect(ctx.requestPasswordReset.execute('nadie@empresa.com')).toBe('no_user');
    await ctx.emailSender.settled();

    expect(ctx.emailSender.sent).toHaveLength(0);
    expect(ctx.resetTokens.latestCreatedAtForUser('u-ana')).toBeNull();
    expect(ctx.resetLog.deliveries).toHaveLength(0);
    expect(ctx.resetLog.failures).toHaveLength(0);
  });

  // Usuario Inactivo: no_user, 0 emails (sad path)
  it('test_request_usuario_inactivo_no_envia', async () => {
    const ctx = createPasswordResetContext();
    ctx.seedUser({ id: 'u-ana', email: 'ana@empresa.com', status: 'inactivo' });

    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('no_user');
    await ctx.emailSender.settled();

    expect(ctx.emailSender.sent).toHaveLength(0);
    expect(ctx.resetTokens.latestCreatedAtForUser('u-ana')).toBeNull();
  });

  // Email con formato inválido: no_user, sin error visible (sad path)
  it('test_request_email_invalido_no_envia', async () => {
    const { ctx } = withActiveUser();

    expect(ctx.requestPasswordReset.execute('no-es-email')).toBe('no_user');
    expect(ctx.requestPasswordReset.execute('')).toBe('no_user');
    await ctx.emailSender.settled();

    expect(ctx.emailSender.sent).toHaveLength(0);
    expect(ctx.resetTokens.latestCreatedAtForUser('u-ana')).toBeNull();
  });

  // Envío que rechaza con code EAUTH: issued y deliveryFailed con errorCode EAUTH, sin el texto (AC-04)
  it('test_request_envio_con_error_registra_fallo', async () => {
    const { ctx } = withActiveUser();
    const smtpError = Object.assign(new Error('Invalid login: 535 credenciales secretas'), { code: 'EAUTH' });
    ctx.emailSender.failWith(smtpError);

    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
    await ctx.emailSender.settled();

    expect(ctx.resetLog.deliveries).toEqual([]);
    expect(ctx.resetLog.failures).toEqual([{ userId: 'u-ana', email: 'ana@empresa.com', errorCode: 'EAUTH' }]);
    const logged = JSON.stringify(ctx.resetLog);
    expect(logged).not.toContain('credenciales secretas');
    expect(logged).not.toContain(ctx.lastSentToken());
    expect(logged).not.toContain('recuperar');

    // Sin `code` string, se registra el `name` del error.
    const ctx2 = withActiveUser().ctx;
    const unconfigured = new Error('sin credenciales');
    unconfigured.name = 'EmailUnconfigured';
    ctx2.emailSender.failWith(unconfigured);
    expect(ctx2.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
    await ctx2.emailSender.settled();
    expect(ctx2.resetLog.failures).toEqual([
      { userId: 'u-ana', email: 'ana@empresa.com', errorCode: 'EmailUnconfigured' },
    ]);
  });

  // A los 3 minutos: throttled, 1 email y el primer token sigue usable (AC-13)
  it('test_request_dentro_de_5_minutos_rechazado_sin_token_nuevo', async () => {
    const { ctx } = withActiveUser();

    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
    await ctx.emailSender.settled();
    const first = ctx.lastSentToken();

    ctx.clock.advance(3 * 60_000);
    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('throttled');
    await ctx.emailSender.settled();

    expect(ctx.emailSender.sent).toHaveLength(1);
    expect(ctx.resetTokens.snapshot().size).toBe(1);
    expect(() => { ctx.checkPasswordResetToken.execute(first); }).not.toThrow();
    expect(ctx.resetLog.deliveries).toHaveLength(1);
  });

  // A los 6 minutos el primer token deja de ser usable y el segundo sirve (AC-08)
  it('test_request_nuevo_token_invalida_anterior', async () => {
    const { ctx } = withActiveUser();

    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
    await ctx.emailSender.settled();
    const first = ctx.lastSentToken();

    ctx.clock.advance(6 * 60_000);
    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
    await ctx.emailSender.settled();
    const second = ctx.lastSentToken();

    expect(second).not.toBe(first);
    expect(ctx.emailSender.sent).toHaveLength(2);
    const firstRow = ctx.resetTokens.findByTokenHash(ctx.resetTokenGenerator.hash(first));
    expect(firstRow?.invalidatedAt).not.toBeNull();
    expect(firstRow?.isUsable(ctx.clock.now())).toBe(false);
    expect(ctx.resetTokens.findByTokenHash(ctx.resetTokenGenerator.hash(second))?.isUsable(ctx.clock.now())).toBe(
      true,
    );
    expect(() => { ctx.checkPasswordResetToken.execute(second); }).not.toThrow();
  });

  // Un envío que nunca resuelve no frena la respuesta (AC-01)
  it('test_request_no_espera_el_envio', async () => {
    const { ctx } = withActiveUser();
    ctx.emailSender.hold();

    const result = ctx.requestPasswordReset.execute('ana@empresa.com');

    expect(result).toBe('issued');
    expect(ctx.emailSender.sent).toHaveLength(1);
    // Todavía no terminó: nada registrado.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(ctx.resetLog.deliveries).toHaveLength(0);
    expect(ctx.resetLog.failures).toHaveLength(0);

    // Cuando por fin termina, se registra la entrega.
    ctx.emailSender.releaseAll();
    await ctx.emailSender.settled();
    expect(ctx.resetLog.deliveries).toEqual([{ userId: 'u-ana', email: 'ana@empresa.com' }]);
  });

  // El control previo del enfriamiento lee sin transacción; solo la emisión abre una (W1)
  it('el control previo del enfriamiento no abre una transacción', async () => {
    const { ctx } = withActiveUser();

    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
    expect(ctx.uow.runs).toBe(1);

    ctx.clock.advance(60_000);
    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('throttled');
    expect(ctx.uow.runs).toBe(1);
    await ctx.emailSender.settled();
  });

  // Un log que lanza nunca produce un rechazo sin manejar, y el pedido sigue siendo `issued` (W2)
  it('un log del envío que lanza no deja promesas rechazadas sin manejar', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const throwingLog = {
        delivered: () => {
          throw new Error('log caído');
        },
        deliveryFailed: () => {
          throw new Error('log caído');
        },
      };
      const ok = createPasswordResetContext({ resetLog: throwingLog });
      ok.seedUser({ id: 'u-ana', email: 'ana@empresa.com' });
      expect(ok.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
      await ok.emailSender.settled();

      const failing = createPasswordResetContext({ resetLog: throwingLog });
      failing.seedUser({ id: 'u-ana', email: 'ana@empresa.com' });
      failing.emailSender.failWith(Object.assign(new Error('x'), { code: 'EAUTH' }));
      expect(failing.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
      await failing.emailSender.settled();

      // Margen para que Node emita `unhandledRejection` si quedó alguna.
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  // Usuario desactivado entre la lectura previa y la transacción: no_user, sin token ni email (W3)
  it('usuario desactivado antes de la transacción no recibe token ni email', async () => {
    const { ctx, user } = withActiveUser();
    ctx.resetTokenGenerator.onGenerate = () => {
      ctx.users.update(user.deactivated());
    };

    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('no_user');
    await ctx.emailSender.settled();

    expect(ctx.emailSender.sent).toHaveLength(0);
    expect(ctx.resetTokens.snapshot().size).toBe(0);
    expect(ctx.resetLog.deliveries).toHaveLength(0);
    expect(ctx.resetLog.failures).toHaveLength(0);
  });

  // Un sender que lanza en forma síncrona se registra como fallo con el code del error (W5)
  it('un envío que lanza en forma síncrona se registra como fallo', async () => {
    const { ctx } = withActiveUser();
    ctx.emailSender.throwSync(Object.assign(new Error('socket roto'), { code: 'ECONNECTION' }));

    expect(ctx.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
    await ctx.emailSender.settled();

    expect(ctx.resetLog.failures).toEqual([
      { userId: 'u-ana', email: 'ana@empresa.com', errorCode: 'ECONNECTION' },
    ]);
    expect(ctx.resetLog.deliveries).toEqual([]);
  });

  // Un error sin `code` ni `name` string se registra como UnknownError, tanto rechazado como lanzado (W5)
  it('un error sin code ni name se registra como UnknownError', async () => {
    const rejected = withActiveUser().ctx;
    rejected.emailSender.failWith({ detalle: 'texto del servidor' });
    expect(rejected.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
    await rejected.emailSender.settled();
    expect(rejected.resetLog.failures).toEqual([
      { userId: 'u-ana', email: 'ana@empresa.com', errorCode: 'UnknownError' },
    ]);

    const thrown = withActiveUser().ctx;
    thrown.emailSender.throwSync({ detalle: 'texto del servidor' });
    expect(thrown.requestPasswordReset.execute('ana@empresa.com')).toBe('issued');
    await thrown.emailSender.settled();
    expect(thrown.resetLog.failures).toEqual([
      { userId: 'u-ana', email: 'ana@empresa.com', errorCode: 'UnknownError' },
    ]);
    expect(JSON.stringify(thrown.resetLog)).not.toContain('texto del servidor');
  });
});
