import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EmailMessage, EmailSender } from '../../../src/application/shared/EmailSender.js';
import { createApp } from '../../../src/infrastructure/http/app.js';
import { TEST_APP_URL } from '../../support/passwordResetContext.js';
import { type TestApp, createTestApp, sessionCookieFrom } from '../../support/testApp.js';

const MINUTE = 60_000;
const PASSWORD = 'contraseña-segura';
const NEW_PASSWORD = 'otra-contraseña-nueva';
const FIXED_MESSAGE = {
  message:
    'Si el email corresponde a un usuario activo, te enviamos un enlace para definir una nueva contraseña. Revisá tu casilla.',
};
const INVALID_LINK = { error: 'El enlace no es válido o venció' };
const BLOCKED_15 = { error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' };
/** Formato válido (43 caracteres base64url) pero sin fila en la base. */
const UNKNOWN_TOKEN = 'Z'.repeat(43);

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(() => {
  t.cleanup();
});

function requestReset(email: string, app = t.app): request.Test {
  return request(app).post('/api/auth/password-reset').send({ email });
}

function checkToken(token: string, app = t.app): request.Test {
  return request(app).post('/api/auth/password-reset/check').send({ token });
}

function confirmReset(token: string, newPassword: string, app = t.app): request.Test {
  return request(app).post('/api/auth/password-reset/confirm').send({ token, newPassword });
}

async function loginStatus(password: string, email = 'admin@empresa.com'): Promise<number> {
  const res = await request(t.app).post('/api/auth/login').send({ email, password });
  return res.status;
}

/** Pide un enlace para el usuario sembrado y devuelve el token del email. */
async function issueToken(email = 'admin@empresa.com'): Promise<string> {
  const res = await requestReset(email);
  expect(res.status).toBe(200);
  await t.emailSender.settled();
  return t.lastSentToken();
}

function resetLines(event: string) {
  return t.logs.filter((l) => l.record.event === event);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number);
}

/** Percentil por el método del rango más cercano (`p` entre 0 y 1). */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index] as number;
}

describe('POST /api/auth/password-reset', () => {
  // Mismo 200 y mismo cuerpo exista o no el usuario; 1 email solo para el existente (AC-01, AC-03)
  it('test_http_pedido_mismo_mensaje_exista_o_no', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    const existing = await requestReset('admin@empresa.com');
    const missing = await requestReset('nadie@empresa.com');
    await t.emailSender.settled();

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body).toEqual(FIXED_MESSAGE);
    expect(missing.body).toEqual(existing.body);
    // Los encabezados tampoco distinguen los casos (salvo `date`): ni Retry-After ni cookies.
    const headersOf = (res: request.Response): Record<string, unknown> => {
      const { date: _date, ...rest } = res.headers as Record<string, unknown>;
      return rest;
    };
    expect(headersOf(missing)).toEqual(headersOf(existing));
    for (const res of [existing, missing]) {
      expect(res.headers['retry-after']).toBeUndefined();
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(t.emailSender.sent).toHaveLength(1);
    expect(t.emailSender.sent[0]?.to).toBe('admin@empresa.com');
    expect(t.emailSender.sent[0]?.text).toContain(`${TEST_APP_URL}/recuperar/`);
    // El inexistente queda en el log como `no_user`; el existente, una sola línea `sent`.
    const lines = resetLines('password_reset_request').map((l) => l.record);
    expect(lines).toHaveLength(2);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: 'no_user', email: 'nadie@empresa.com' }),
        expect.objectContaining({ outcome: 'sent', email: 'admin@empresa.com' }),
      ]),
    );
  });

  // La URL sale de APP_URL, nunca del Host de la solicitud (AC-02)
  it('test_http_url_ignora_host_de_la_solicitud', async () => {
    t.cleanup();
    t = await createTestApp({}, { appUrl: 'https://aldebaran.empresa.com' });
    await t.seedUser({ email: 'admin@empresa.com' });

    const res = await request(t.app)
      .post('/api/auth/password-reset')
      .set('Host', 'otro-sitio.com')
      .set('X-Forwarded-Host', 'otro-sitio.com')
      .send({ email: 'admin@empresa.com' });
    await t.emailSender.settled();

    expect(res.status).toBe(200);
    expect(t.emailSender.sent).toHaveLength(1);
    const text = t.emailSender.sent[0]?.text ?? '';
    const url = /https?:\/\/\S+/.exec(text)?.[0] ?? '';
    expect(url.startsWith('https://aldebaran.empresa.com/recuperar/')).toBe(true);
    expect(text).not.toContain('otro-sitio.com');
  });

  // Sender que falla: mismo 200 y una línea `send_failed` (AC-04)
  it('test_http_envio_con_error_mismo_mensaje_y_log', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    t.emailSender.failWith(Object.assign(new Error('Invalid login: 535 credenciales'), { code: 'EAUTH' }));

    const res = await requestReset('admin@empresa.com');
    await t.emailSender.settled();

    expect(res.status).toBe(200);
    expect(res.body).toEqual(FIXED_MESSAGE);
    const lines = resetLines('password_reset_request');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      level: 'error',
      record: expect.objectContaining({
        event: 'password_reset_request',
        outcome: 'send_failed',
        email: 'admin@empresa.com',
        errorCode: 'EAUTH',
      }) as unknown,
    });
    expect(JSON.stringify(t.logs)).not.toContain('535 credenciales');
  });

  // Body sin email → 400 y cuenta para el límite
  it('test_http_pedido_body_invalido_rechazado_y_cuenta', async () => {
    const invalid = await request(t.app).post('/api/auth/password-reset').send({});
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ error: 'El campo "email" es obligatorio y debe ser texto' });

    // 1 inválido + 4 válidos = 5 pedidos contados: el siguiente da 429.
    for (let i = 0; i < 4; i++) expect((await requestReset('nadie@empresa.com')).status).toBe(200);
    expect((await requestReset('nadie@empresa.com')).status).toBe(429);
  });

  // 6 pedidos desde la misma IP: el 6.º da 429 con los minutos y Retry-After (AC-12)
  it('test_http_sexto_pedido_rechazado_429', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    for (let i = 0; i < 5; i++) {
      const res = await requestReset('admin@empresa.com');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(FIXED_MESSAGE);
    }

    const sixth = await requestReset('admin@empresa.com');

    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual(BLOCKED_15);
    expect(sixth.headers['retry-after']).toBe('900');
    expect(resetLines('password_reset_request').at(-1)?.record).toMatchObject({ outcome: 'blocked' });
  });

  // Dos pedidos en 3 minutos: mismo mensaje, 1 email y la URL sigue válida (AC-13)
  it('test_http_dos_pedidos_en_3_minutos_un_email', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    const first = await requestReset('admin@empresa.com');
    t.clock.advance(3 * MINUTE);
    const second = await requestReset('admin@empresa.com');
    await t.emailSender.settled();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(t.emailSender.sent).toHaveLength(1);
    expect((await checkToken(t.lastSentToken())).status).toBe(204);
    expect(resetLines('password_reset_request').map((l) => l.record.outcome)).toEqual(['sent', 'throttled']);
  });

  // Los 429 no extienden el bloqueo (AC-12)
  it('test_http_bloqueado_no_cuenta', async () => {
    for (let i = 0; i < 5; i++) expect((await requestReset('nadie@empresa.com')).status).toBe(200);

    t.clock.advance(10 * MINUTE);
    const blocked = await requestReset('nadie@empresa.com');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('300');

    // Si el 429 hubiera contado, el bloqueo llegaría hasta los 25 minutos.
    t.clock.advance(5 * MINUTE);
    expect((await requestReset('nadie@empresa.com')).status).toBe(200);

    // Lo mismo en las confirmaciones.
    for (let i = 0; i < 5; i++) expect((await checkToken(UNKNOWN_TOKEN)).status).toBe(400);
    t.clock.advance(10 * MINUTE);
    expect((await checkToken(UNKNOWN_TOKEN)).status).toBe(429);
    t.clock.advance(5 * MINUTE);
    expect((await checkToken(UNKNOWN_TOKEN)).status).toBe(400);
  });

  // Sender de 500 ms; 20 pedidos de cada clase: medianas parejas y ninguno ≥ 500 ms (AC-03)
  it('test_http_tiempo_de_respuesta_parejo', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const pending: Array<Promise<void>> = [];
    const slowSender: EmailSender = {
      send: (_message: EmailMessage) => {
        const sending = new Promise<void>((resolve) => setTimeout(resolve, 500));
        pending.push(sending);
        return sending;
      },
    };
    const deps = { ...t.deps, requestPasswordReset: t.requestPasswordResetWith(slowSender) };
    const times = { exists: [] as number[], missing: [] as number[], cooldown: [] as number[] };

    async function timed(app: ReturnType<typeof createApp>, email: string): Promise<number> {
      const started = performance.now();
      const res = await requestReset(email, app);
      const elapsed = performance.now() - started;
      expect(res.status).toBe(200);
      expect(res.body).toEqual(FIXED_MESSAGE);
      return elapsed;
    }

    // Órdenes rotados por vuelta para que ninguna clase quede siempre primera o última (calentamiento
    // de la conexión, GC). "Enfriamiento" siempre va después de "existe", que es quien emite el token.
    type Kind = keyof typeof times;
    const orders: Kind[][] = [
      ['exists', 'missing', 'cooldown'],
      ['missing', 'exists', 'cooldown'],
      ['exists', 'cooldown', 'missing'],
    ];
    const emailOf: Record<Kind, string> = {
      exists: 'admin@empresa.com',
      missing: 'nadie@empresa.com',
      cooldown: 'admin@empresa.com',
    };

    // Una vuelta de calentamiento, que no se mide.
    for (let round = -1; round < 20; round++) {
      // Una app por vuelta (3 pedidos): el límite de 5 por IP no interfiere con la medición.
      const app = createApp(deps);
      t.clock.advance(5 * MINUTE);
      for (const kind of orders[(round + 1) % orders.length] as Kind[]) {
        const elapsed = await timed(app, emailOf[kind]);
        if (round >= 0) times[kind].push(elapsed);
      }
    }

    const outcomes = resetLines('password_reset_request').map((l) => l.record.outcome);
    expect(outcomes.filter((o) => o === 'no_user')).toHaveLength(21);
    expect(outcomes.filter((o) => o === 'throttled')).toHaveLength(21);
    // El tope de 100 ms entre medianas detecta regresiones gruesas, como esperar al SMTP en el camino
    // de la respuesta; no prueba la ausencia de un oráculo de tiempo de milisegundos (la rama con
    // usuario hace una escritura en SQLite que las otras no).
    const medians = [median(times.exists), median(times.missing), median(times.cooldown)];
    expect(Math.max(...medians) - Math.min(...medians)).toBeLessThan(100);
    // Ninguna clase espera al envío de 500 ms: el p90 de cada una queda por debajo (un pico aislado
    // del runner no voltea el test).
    for (const kind of Object.keys(times) as Kind[]) {
      expect(percentile(times[kind], 0.9)).toBeLessThan(500);
    }

    await Promise.all(pending);
  });
});

describe('POST /api/auth/password-reset/check y /confirm', () => {
  // 2 sesiones → 401 en ambas; login con la nueva 200 (AC-11)
  it('test_http_confirm_cambia_y_cierra_sesiones', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookies: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });
      expect(res.status).toBe(200);
      cookies.push(sessionCookieFrom(res.headers['set-cookie']) as string);
    }
    const token = await issueToken();

    const res = await confirmReset(token, NEW_PASSWORD);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    for (const cookie of cookies) {
      expect((await request(t.app).get('/api/auth/session').set('Cookie', cookie)).status).toBe(401);
    }
    expect(await loginStatus(NEW_PASSWORD)).toBe(200);
    expect(await loginStatus(PASSWORD)).toBe(401);
  });

  // Nueva de 7 caracteres → 400 y el check posterior da 204 (AC-10)
  it('test_http_confirm_contraseña_corta_rechazada', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const token = await issueToken();

    const res = await confirmReset(token, 'a'.repeat(7));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'La contraseña debe tener entre 8 y 1024 caracteres' });
    expect((await checkToken(token)).status).toBe(204);
    expect(await loginStatus(PASSWORD)).toBe(200);
    // No cuenta para el límite: 5 más siguen dando 400, nunca 429.
    for (let i = 0; i < 5; i++) expect((await confirmReset(token, 'corta')).status).toBe(400);
    expect((await checkToken(token)).status).toBe(204);
    expect(resetLines('password_reset_confirm').at(-1)?.record).toMatchObject({ outcome: 'invalid', email: null });
  });

  // Check y confirm con token inexistente → 400 "El enlace no es válido o venció" (AC-07)
  it('test_http_token_invalido_rechazado_400', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    const check = await checkToken(UNKNOWN_TOKEN);
    const confirm = await confirmReset(UNKNOWN_TOKEN, NEW_PASSWORD);

    expect(check.status).toBe(400);
    expect(check.body).toEqual(INVALID_LINK);
    expect(confirm.status).toBe(400);
    expect(confirm.body).toEqual(INVALID_LINK);
    expect(resetLines('password_reset_confirm').map((l) => l.record)).toEqual([
      expect.objectContaining({ outcome: 'invalid_token', email: null }),
    ]);
    expect(await loginStatus(PASSWORD)).toBe(200);
  });

  // 5 tokens inválidos y después uno válido → 429 sin validar (AC-14)
  it('test_http_sexta_confirmacion_rechazada_con_token_valido', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const token = await issueToken();
    for (let i = 0; i < 3; i++) expect((await checkToken(UNKNOWN_TOKEN)).status).toBe(400);
    for (let i = 0; i < 2; i++) expect((await confirmReset(UNKNOWN_TOKEN, NEW_PASSWORD)).status).toBe(400);

    const res = await confirmReset(token, NEW_PASSWORD);

    expect(res.status).toBe(429);
    expect(res.body).toEqual(BLOCKED_15);
    expect(res.headers['retry-after']).toBe('900');
    expect((await checkToken(token)).status).toBe(429);
    // No se validó ni se usó: la contraseña sigue igual y el token sigue sirviendo.
    expect(await loginStatus(PASSWORD)).toBe(200);
    expect(() => {
      t.deps.checkPasswordResetToken.execute(token);
    }).not.toThrow();
  });

  // 4 inválidos, 1 check válido, 1 inválido → el siguiente da 429
  it('test_http_token_valido_no_reinicia_conteo', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const token = await issueToken();
    for (let i = 0; i < 4; i++) expect((await checkToken(UNKNOWN_TOKEN)).status).toBe(400);
    expect((await checkToken(token)).status).toBe(204);
    expect((await checkToken(UNKNOWN_TOKEN)).status).toBe(400);

    expect((await checkToken(token)).status).toBe(429);
  });

  // Pedido + confirmación: el log tiene sent y ok; ni el log ni las filas tienen el token ni la contraseña (AC-16)
  it('test_http_log_sin_token_ni_contraseña', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const token = await issueToken();
    expect((await checkToken(token)).status).toBe(204);
    expect((await confirmReset(token, NEW_PASSWORD)).status).toBe(204);

    expect(resetLines('password_reset_request').map((l) => l.record)).toEqual([
      expect.objectContaining({ event: 'password_reset_request', outcome: 'sent', email: 'admin@empresa.com' }),
    ]);
    expect(resetLines('password_reset_confirm').map((l) => l.record)).toEqual([
      expect.objectContaining({ event: 'password_reset_confirm', outcome: 'ok', email: null }),
    ]);

    const everything = JSON.stringify(t.logs);
    const tokenRows = JSON.stringify(t.db.$client.prepare('SELECT * FROM password_reset_tokens').all());
    const userRows = JSON.stringify(t.db.$client.prepare('SELECT * FROM users').all());
    expect(tokenRows).toContain(t.resetTokenGenerator.hash(token));
    for (const dump of [everything, tokenRows, userRows]) {
      expect(dump).not.toContain(token);
      expect(dump).not.toContain(NEW_PASSWORD);
      expect(dump).not.toContain(PASSWORD);
      expect(dump).not.toContain('/recuperar/');
    }
  });

  // Bloqueadas, las compuertas de check y confirm registran password_reset_confirm/blocked sin email
  it('las compuertas de check y confirm registran el bloqueo con email null', async () => {
    for (let i = 0; i < 5; i++) expect((await checkToken(UNKNOWN_TOKEN)).status).toBe(400);

    expect((await checkToken(UNKNOWN_TOKEN)).status).toBe(429);
    expect((await confirmReset(UNKNOWN_TOKEN, NEW_PASSWORD)).status).toBe(429);

    const blocked = t.logs.filter((l) => l.record.outcome === 'blocked').map((l) => l.record);
    expect(blocked).toEqual([
      expect.objectContaining({ event: 'password_reset_confirm', outcome: 'blocked', email: null }),
      expect.objectContaining({ event: 'password_reset_confirm', outcome: 'blocked', email: null }),
    ]);
  });

  // Confirm con body inválido: 400, log `invalid` y no cuenta para el límite
  it('confirm con body inválido rechazado 400, registrado como invalid y sin contar', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const token = await issueToken();
    const invalidBodies = [{}, { token }, { newPassword: NEW_PASSWORD }, { token: 1, newPassword: NEW_PASSWORD }, [], { token: 'x'.repeat(65), newPassword: NEW_PASSWORD }];
    for (const body of invalidBodies) {
      const res = await request(t.app).post('/api/auth/password-reset/confirm').send(body);
      expect(res.status).toBe(400);
    }

    expect(resetLines('password_reset_confirm').map((l) => l.record.outcome)).toEqual(Array(6).fill('invalid'));
    // 6 bodies inválidos no bloquean: la confirmación con el token válido pasa.
    expect((await confirmReset(token, NEW_PASSWORD)).status).toBe(204);
    expect(await loginStatus(NEW_PASSWORD)).toBe(200);
  });

  // Error inesperado en confirm: 500 genérico, log `error` y sin el token
  it('confirm con error inesperado responde 500 y registra error', async () => {
    t.cleanup();
    t = await createTestApp({
      resetPasswordWithToken: { execute: () => Promise.reject(new Error('falla inesperada')) },
    });

    const res = await confirmReset(UNKNOWN_TOKEN, NEW_PASSWORD);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno' });
    expect(resetLines('password_reset_confirm').map((l) => l.record)).toEqual([
      expect.objectContaining({ outcome: 'error', email: null }),
    ]);
    expect(JSON.stringify(t.logs)).not.toContain(UNKNOWN_TOKEN);
    expect(JSON.stringify(t.logs)).not.toContain(NEW_PASSWORD);
  });

  // Check con body inválido: 400 y no cuenta para el límite
  it('check con body inválido rechazado 400 y sin contar', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const token = await issueToken();
    for (const body of [{}, { token: 1 }, { token: 'x'.repeat(65) }, [], { otro: token }, { token: null }]) {
      const res = await request(t.app).post('/api/auth/password-reset/check').send(body);
      expect(res.status).toBe(400);
    }

    expect((await checkToken(token)).status).toBe(204);
  });
});
