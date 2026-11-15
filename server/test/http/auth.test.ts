import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { InvalidCredentials } from '../../src/application/auth/errors.js';
import { createApp } from '../../src/infrastructure/http/app.js';
import { createJsonLogger } from '../../src/infrastructure/http/authLog.js';
import { responseBody } from '../support/responseBody.js';
import { type TestApp, createTestApp, sessionCookieFrom } from '../support/testApp.js';

const PASSWORD = 'contraseña-segura';
const GENERIC_401 = { error: 'Email o contraseña incorrectos' };

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(() => {
  t.cleanup();
});

function countSessions(): number {
  const row = t.db.$client.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
  return row.n;
}

async function loginAs(email: string, password = PASSWORD): Promise<string> {
  const res = await request(t.app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  const cookie = sessionCookieFrom(res.headers['set-cookie']);
  expect(cookie).toBeDefined();
  return cookie as string;
}

describe('POST /api/auth/login', () => {
  // POST /api/auth/login con credenciales válidas responde 200, PublicUser y cookie httpOnly SameSite=Strict
  it('test_post_login_credenciales_validas_200_public_user_y_cookie_segura', async () => {
    const user = await t.seedUser({ email: 'admin@empresa.com', name: 'Ana Pérez' });

    const res = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: user.id, name: 'Ana Pérez', email: 'admin@empresa.com', role: 'admin', status: 'activo' },
    });
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = setCookie.find((c) => c.startsWith('aldebaran_sid='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/aldebaran_sid=[A-Za-z0-9_-]{43};/);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Strict/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
    expect(cookie).not.toMatch(/Max-Age|Expires/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
    expect(countSessions()).toBe(1);
  });

  // POST /api/auth/login con email en mayúsculas inicia sesión
  it('test_post_login_email_en_mayusculas_inicia_sesion', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    const res = await request(t.app).post('/api/auth/login').send({ email: 'Admin@Empresa.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(responseBody(res.body, { user: { email: 'string' } }).user.email).toBe('admin@empresa.com');
    expect(sessionCookieFrom(res.headers['set-cookie'])).toBeDefined();
  });

  // POST /api/auth/login con contraseña incorrecta, email inexistente o usuario Inactivo es rechazado con 401 y el mismo mensaje
  it('test_post_login_credenciales_invalidas_401_con_el_mismo_mensaje', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    await t.seedUser({ email: 'inactivo@empresa.com', status: 'inactivo' });

    const attempts = [
      { email: 'admin@empresa.com', password: 'otra-contraseña' },
      { email: 'nadie@empresa.com', password: PASSWORD },
      { email: 'inactivo@empresa.com', password: PASSWORD },
    ];
    for (const body of attempts) {
      const res = await request(t.app).post('/api/auth/login').send(body);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(GENERIC_401);
      expect(sessionCookieFrom(res.headers['set-cookie'])).toBeUndefined();
    }
    expect(countSessions()).toBe(0);
  });

  // POST /api/auth/login con campo faltante es rechazado con 400
  it('test_post_login_campo_faltante_rechazado_400', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    const sinPassword = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com' });
    expect(sinPassword.status).toBe(400);
    expect(responseBody(sinPassword.body, { error: 'string' }).error).toMatch(/password/);

    const sinEmail = await request(t.app).post('/api/auth/login').send({ password: PASSWORD });
    expect(sinEmail.status).toBe(400);
    expect(responseBody(sinEmail.body, { error: 'string' }).error).toMatch(/email/);

    const tipoInvalido = await request(t.app).post('/api/auth/login').send({ email: 123, password: PASSWORD });
    expect(tipoInvalido.status).toBe(400);
    expect(responseBody(tipoInvalido.body, { error: 'string' }).error).toMatch(/email/);

    expect(countSessions()).toBe(0);
  });

  // POST /api/auth/login sin Content-Type JSON es rechazado con 415
  it('test_post_login_sin_content_type_json_rechazado_415', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    const form = await request(t.app)
      .post('/api/auth/login')
      .type('form')
      .send({ email: 'admin@empresa.com', password: PASSWORD });
    expect(form.status).toBe(415);

    const text = await request(t.app)
      .post('/api/auth/login')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ email: 'admin@empresa.com', password: PASSWORD }));
    expect(text.status).toBe(415);

    expect(sessionCookieFrom(form.headers['set-cookie'])).toBeUndefined();
    expect(countSessions()).toBe(0);
    expect(t.logs.filter((l) => l.record.event === 'login')).toHaveLength(0);
  });

  it('POST /api/auth/login con body de más de 10 kB es rechazado con 413 sin ejecutar el caso de uso (R-03)', async () => {
    let calls = 0;
    t.cleanup();
    t = await createTestApp({
      login: {
        execute: () => {
          calls += 1;
          return Promise.reject(new Error('no debería ejecutarse'));
        },
      },
    });

    const res = await request(t.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'admin@empresa.com', password: 'a'.repeat(11 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'El body es demasiado grande' });
    expect(calls).toBe(0);
  });

  it('POST /api/auth/login con charset no soportado es rechazado con 415 sin ejecutar el caso de uso', async () => {
    let calls = 0;
    t.cleanup();
    t = await createTestApp({
      login: {
        execute: () => {
          calls += 1;
          return Promise.reject(new Error('no debería ejecutarse'));
        },
      },
    });

    const res = await request(t.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json; charset=latin1')
      .send(JSON.stringify({ email: 'admin@empresa.com', password: PASSWORD }));

    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: 'Content-Type debe ser application/json' });
    expect(calls).toBe(0);
  });

  it('POST /api/auth/login con JSON mal formado sigue siendo rechazado con 400', async () => {
    const res = await request(t.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'El body no es un JSON válido' });
  });

  it('POST /api/auth/login con contraseña de más de 1024 caracteres es rechazado con 400 sin verificar', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    const res = await request(t.app)
      .post('/api/auth/login')
      .send({ email: 'admin@empresa.com', password: 'a'.repeat(1025) });

    expect(res.status).toBe(400);
    expect(responseBody(res.body, { error: 'string' }).error).toMatch(/password/);
    expect(t.logs.filter((l) => l.record.event === 'login')).toHaveLength(0);
    expect(countSessions()).toBe(0);
  });

  it('POST /api/auth/login con email de formato inválido es rechazado con 400', async () => {
    const res = await request(t.app).post('/api/auth/login').send({ email: 'no-es-un-email', password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'El email no tiene un formato válido' });
  });

  it('POST /api/auth/login con JSON mal formado es rechazado con 400', async () => {
    const res = await request(t.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String) as unknown });
  });
});

describe('POST /api/auth/logout', () => {
  // POST /api/auth/logout y luego GET /api/auth/session con la misma cookie es rechazado con 401
  it('test_post_logout_y_get_session_con_la_misma_cookie_rechazado_401', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    const before = await request(t.app).get('/api/auth/session').set('Cookie', cookie);
    expect(before.status).toBe(200);

    const logout = await request(t.app).post('/api/auth/logout').set('Cookie', cookie).send({});
    expect(logout.status).toBe(204);
    const cleared = ([] as string[]).concat(logout.headers['set-cookie'] ?? []).find((c) => c.startsWith('aldebaran_sid='));
    expect(cleared).toMatch(/^aldebaran_sid=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(countSessions()).toBe(0);

    const after = await request(t.app).get('/api/auth/session').set('Cookie', cookie);
    expect(after.status).toBe(401);
    expect(after.body).toEqual({ error: 'Sesión no válida' });
  });

  it('POST /api/auth/logout sin Content-Type JSON es rechazado con 415 y no cierra la sesión', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    const res = await request(t.app).post('/api/auth/logout').set('Cookie', cookie).type('form').send('x=1');

    expect(res.status).toBe(415);
    expect(countSessions()).toBe(1);
  });
});

describe('POST /api/auth/password', () => {
  const NEW_PASSWORD = 'otra-contraseña-nueva';
  const WEAK_PASSWORD = { error: 'La contraseña debe tener entre 8 y 1024 caracteres' };

  async function changePassword(cookie: string | undefined, body: unknown): Promise<request.Response> {
    const req = request(t.app).post('/api/auth/password');
    if (cookie !== undefined) req.set('Cookie', cookie);
    return req.send(body as object);
  }

  async function loginStatus(email: string, password: string): Promise<number> {
    const res = await request(t.app).post('/api/auth/login').send({ email, password });
    return res.status;
  }

  function passwordChangeLogs(): Record<string, unknown>[] {
    return t.logs.filter((l) => l.record.event === 'password_change').map((l) => l.record);
  }

  // Con sesión y datos válidos responde 204 y el login con la nueva funciona (AC-03)
  it('test_post_password_cambia_y_responde_204', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    const res = await changePassword(cookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await loginStatus('admin@empresa.com', NEW_PASSWORD)).toBe(200);
    expect(await loginStatus('admin@empresa.com', PASSWORD)).toBe(401);
  });

  // Contraseña actual incorrecta → 400 con "La contraseña actual es incorrecta" (AC-05, AC-14)
  it('test_post_password_actual_incorrecta_400_rechazado', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    const res = await changePassword(cookie, { currentPassword: 'clave-equivocada', newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'La contraseña actual es incorrecta' });
    // 400 y no 401: la sesión sigue abierta.
    expect((await request(t.app).get('/api/auth/session').set('Cookie', cookie)).status).toBe(200);
    expect(await loginStatus('admin@empresa.com', PASSWORD)).toBe(200);
  });

  // Nueva de 7 caracteres → 400 con el mensaje de WeakPassword (AC-06)
  it('test_post_password_nueva_corta_400_rechazado', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    const res = await changePassword(cookie, { currentPassword: PASSWORD, newPassword: 'a'.repeat(7) });

    expect(res.status).toBe(400);
    expect(res.body).toEqual(WEAK_PASSWORD);
    expect(await loginStatus('admin@empresa.com', PASSWORD)).toBe(200);
  });

  // Nueva de 1025 caracteres → 400 con el mensaje de WeakPassword, no el de InvalidBody (AC-07)
  it('test_post_password_nueva_larga_400_rechazado', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    const res = await changePassword(cookie, { currentPassword: PASSWORD, newPassword: 'a'.repeat(1025) });

    expect(res.status).toBe(400);
    expect(res.body).toEqual(WEAK_PASSWORD);
    expect(await loginStatus('admin@empresa.com', PASSWORD)).toBe(200);
  });

  // Nueva igual a la actual → 400 con el mensaje de PasswordUnchanged (AC-08)
  it('test_post_password_igual_a_la_actual_400_rechazado', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    const res = await changePassword(cookie, { currentPassword: PASSWORD, newPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'La contraseña nueva debe ser distinta de la actual' });
    expect(passwordChangeLogs()).toEqual([expect.objectContaining({ outcome: 'invalid' })]);
  });

  // Campo faltante → 400 y queda en el log como invalid (AC-11)
  it('test_post_password_body_invalido_400', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    const sinNueva = await changePassword(cookie, { currentPassword: PASSWORD });
    expect(sinNueva.status).toBe(400);
    expect(responseBody(sinNueva.body, { error: 'string' }).error).toMatch(/newPassword/);

    const actualLarga = await changePassword(cookie, { currentPassword: 'a'.repeat(1025), newPassword: NEW_PASSWORD });
    expect(actualLarga.status).toBe(400);
    expect(responseBody(actualLarga.body, { error: 'string' }).error).toMatch(/currentPassword/);

    expect(passwordChangeLogs()).toEqual([
      expect.objectContaining({ event: 'password_change', outcome: 'invalid', email: 'admin@empresa.com' }),
      expect.objectContaining({ event: 'password_change', outcome: 'invalid', email: 'admin@empresa.com' }),
    ]);
    expect(await loginStatus('admin@empresa.com', PASSWORD)).toBe(200);
  });

  // Sin cookie (o con una inválida) → 401 y la contraseña no cambia (AC-15)
  it('test_post_password_sin_sesion_401_no_autorizado', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const body = { currentPassword: PASSWORD, newPassword: NEW_PASSWORD };

    const sinCookie = await changePassword(undefined, body);
    expect(sinCookie.status).toBe(401);
    expect(sinCookie.body).toEqual({ error: 'Sesión no válida' });
    const cookieInvalida = await changePassword('aldebaran_sid=no-es-una-sesion', body);
    expect(cookieInvalida.status).toBe(401);

    expect(passwordChangeLogs()).toHaveLength(0);
    expect(await loginStatus('admin@empresa.com', NEW_PASSWORD)).toBe(401);

    // Control: con sesión, el mismo pedido sí llega a la ruta y cambia la contraseña.
    const cookie = await loginAs('admin@empresa.com');
    expect((await changePassword(cookie, body)).status).toBe(204);
  });

  // Registra password_change/wrong_current con el email y sin ninguna de las contraseñas (AC-11)
  it('test_post_password_log_actual_incorrecta_sin_contraseñas', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    await changePassword(cookie, { currentPassword: 'clave-equivocada', newPassword: NEW_PASSWORD });

    expect(passwordChangeLogs()).toEqual([
      {
        event: 'password_change',
        outcome: 'wrong_current',
        email: 'admin@empresa.com',
        ip: expect.any(String) as unknown,
        at: '2026-11-04T12:00:00.000Z',
      },
    ]);
    const everything = JSON.stringify(t.logs);
    expect(everything).not.toContain('clave-equivocada');
    expect(everything).not.toContain(NEW_PASSWORD);
    expect(everything).not.toContain(PASSWORD);
  });

  // Registra password_change/ok; ni el log ni la respuesta contienen la contraseña nueva (AC-12)
  it('test_post_password_log_ok_sin_contraseña_nueva', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    const res = await changePassword(cookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(204);
    expect(passwordChangeLogs()).toEqual([
      {
        event: 'password_change',
        outcome: 'ok',
        email: 'admin@empresa.com',
        ip: expect.any(String) as unknown,
        at: '2026-11-04T12:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(t.logs)).not.toContain(NEW_PASSWORD);
    expect(res.text).not.toContain(NEW_PASSWORD);
    expect(JSON.stringify(res.headers)).not.toContain(NEW_PASSWORD);
  });

  // Error inesperado en el caso de uso → 500 "Error interno" y log `error` (AC-12)
  it('test_post_password_error_interno_500', async () => {
    t.cleanup();
    t = await createTestApp({
      changeOwnPassword: { execute: () => Promise.reject(new Error('SQLITE_BUSY: detalle interno')) },
    });
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');

    const res = await changePassword(cookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno' });
    expect(passwordChangeLogs()).toEqual([
      expect.objectContaining({ event: 'password_change', outcome: 'error', email: 'admin@empresa.com' }),
    ]);
    expect(JSON.stringify(t.logs)).not.toContain(NEW_PASSWORD);
  });
});

describe('FR-08 y errores', () => {
  // Ninguna respuesta de login, first-admin ni session contiene passwordHash ni password_hash
  it('test_ninguna_respuesta_contiene_password_hash', async () => {
    const created = await request(t.app)
      .post('/api/setup/first-admin')
      .send({ name: 'Ana Pérez', email: 'admin@empresa.com', password: PASSWORD });
    expect(created.status).toBe(201);

    const login = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });
    expect(login.status).toBe(200);
    const cookie = sessionCookieFrom(login.headers['set-cookie']) as string;

    const session = await request(t.app).get('/api/auth/session').set('Cookie', cookie);
    expect(session.status).toBe(200);

    for (const res of [created, login, session]) {
      expect(Object.keys(responseBody(res.body, { user: 'object' }).user).sort()).toEqual(['email', 'id', 'name', 'role', 'status']);
      expect(res.text).not.toMatch(/passwordHash|password_hash|\$argon2/);
    }
  });

  // Error inesperado en un caso de uso responde 500 sin stack (error)
  it('test_error_inesperado_en_caso_de_uso_responde_500_sin_stack', async () => {
    t.cleanup();
    t = await createTestApp({
      login: {
        execute: () => Promise.reject(new Error('SQLITE_BUSY: detalle interno /ruta/secreta')),
      },
    });

    const res = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno' });
    expect(res.text).not.toMatch(/SQLITE_BUSY|secreta|at |\.ts/);
    const errorLog = t.logs.find((l) => l.level === 'error');
    expect(JSON.stringify(errorLog?.record)).toMatch(/SQLITE_BUSY/);
  });

  it('DrizzleQueryError en un caso de uso se loguea con la query y la causa, nunca con los params', async () => {
    const QUERY = 'insert into "sessions" ("token_hash", "user_id") values (?, ?)';
    const PARAMS = ['tokenhash-secreto-abc123', '$argon2id$v=19$hash-secreto', 'persona@secreta.com'];
    t.cleanup();
    t = await createTestApp({
      login: {
        execute: () => {
          const cause = Object.assign(new Error('SQLITE_BUSY: database is locked'), { code: 'SQLITE_BUSY' });
          return Promise.reject(new DrizzleQueryError(QUERY, PARAMS, cause));
        },
      },
    });

    const res = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno' });
    const errorLog = t.logs.find((l) => l.level === 'error');
    expect(errorLog).toBeDefined();
    const logged = JSON.stringify(errorLog?.record);
    expect(logged).toContain(QUERY.replace(/"/g, '\\"'));
    expect(logged).toMatch(/SQLITE_BUSY: database is locked/);
    for (const param of PARAMS) expect(logged).not.toContain(param);
    expect(logged).not.toMatch(/params:/);
  });
});

describe('authLog', () => {
  // authLog registra el intento de login sin la contraseña
  it('test_auth_log_registra_el_intento_de_login_sin_la_contrasena', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    await request(t.app).post('/api/auth/login').send({ email: 'Admin@Empresa.com', password: PASSWORD });
    await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: 'clave-equivocada' });

    const attempts = t.logs.filter((l) => l.record.event === 'login').map((l) => l.record);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual({
      event: 'login',
      outcome: 'ok',
      email: 'admin@empresa.com',
      ip: expect.any(String) as unknown,
      at: '2026-11-04T12:00:00.000Z',
    });
    expect(attempts[1]).toMatchObject({ event: 'login', outcome: 'invalid', email: 'admin@empresa.com' });

    const everything = JSON.stringify(t.logs);
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toContain('clave-equivocada');
    expect(everything).not.toMatch(/aldebaran_sid|token/i);
  });

  it('un login con email inválido se registra como invalid con email null, sin el texto crudo', async () => {
    // Una contraseña escrita por error en el campo email no debe quedar en el log (R-05).
    const res = await request(t.app).post('/api/auth/login').send({ email: '  MiClave$ecreta99 ', password: PASSWORD });

    expect(res.status).toBe(400);
    const attempts = t.logs.filter((l) => l.record.event === 'login').map((l) => l.record);
    expect(attempts).toEqual([
      { event: 'login', outcome: 'invalid', email: null, ip: expect.any(String) as unknown, at: '2026-11-04T12:00:00.000Z' },
    ]);
    expect(JSON.stringify(t.logs).toLowerCase()).not.toContain('miclave$ecreta99');
  });

  it('createJsonLogger escribe una línea JSON por registro en el destino (stdout)', () => {
    const lines: string[] = [];
    const logger = createJsonLogger((line) => lines.push(line));

    logger.info({ event: 'login', outcome: 'ok' });
    logger.error({ event: 'unexpected_error' });

    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.endsWith('\n'))).toBe(true);
    expect(JSON.parse(lines[0] as string)).toEqual({ level: 'info', event: 'login', outcome: 'ok' });
    expect(JSON.parse(lines[1] as string)).toEqual({ level: 'error', event: 'unexpected_error' });
  });
});

describe('límite de intentos (FEAT-009)', () => {
  const MINUTE = 60_000;
  const BLOCKED_15 = { error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' };
  const WRONG = 'clave-equivocada';
  const NEW_PASSWORD = 'otra-contraseña-nueva';

  async function loginStatus(password = PASSWORD, app = t.app, email = 'admin@empresa.com'): Promise<number> {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return res.status;
  }

  /** `n` logins con contraseña incorrecta; cada uno debe dar 401. */
  async function failLogins(n: number, app = t.app): Promise<void> {
    for (let i = 0; i < n; i++) expect(await loginStatus(WRONG, app)).toBe(401);
  }

  async function changePassword(cookie: string, currentPassword: string, newPassword: string): Promise<request.Response> {
    return request(t.app).post('/api/auth/password').set('Cookie', cookie).send({ currentPassword, newPassword });
  }

  // 5 contraseñas incorrectas → el sexto intento, aun correcto, da 429 (AC-01)
  it('test_login_quinto_fallo_bloquea_sexto_rechazado', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    await failLogins(5);

    const res = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });

    expect(res.status).toBe(429);
    expect(res.body).toEqual(BLOCKED_15);
    expect(sessionCookieFrom(res.headers['set-cookie'])).toBeUndefined();
    expect(countSessions()).toBe(0);
  });

  // A los 15 minutos del quinto fallo, el login correcto vuelve a dar 200 (AC-02)
  it('test_login_desbloquea_a_los_15_minutos', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    await failLogins(5);

    t.clock.advance(15 * MINUTE - 1);
    expect(await loginStatus()).toBe(429);

    t.clock.advance(1);
    expect(await loginStatus()).toBe(200);
  });

  // Un fallo de hace más de 15 minutos no cuenta: 1 viejo + 4 recientes no bloquean (AC-03)
  it('test_login_fallo_fuera_de_ventana_no_cuenta', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    await failLogins(1);
    t.clock.advance(15 * MINUTE + 1000);
    await failLogins(4);

    expect(await loginStatus()).toBe(200);

    // Control: el límite está activo (el acierto reinició el contador; 5 fallos sí bloquean).
    await failLogins(5);
    expect(await loginStatus()).toBe(429);
  });

  // 5 emails con formato inválido (400) no cuentan: el login correcto da 200 (AC-04)
  it('test_login_email_invalido_no_cuenta', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    for (let i = 0; i < 5; i++) expect(await loginStatus(PASSWORD, t.app, 'no-es-un-email')).toBe(400);

    expect(await loginStatus()).toBe(200);

    // Control: el límite está activo.
    await failLogins(5);
    expect(await loginStatus()).toBe(429);
  });

  // 5 contraseñas actuales incorrectas → el sexto cambio, aun correcto, da 429 y no cambia (AC-05)
  it('test_password_actual_incorrecta_bloquea_sexto_rechazado', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');
    for (let i = 0; i < 5; i++) expect((await changePassword(cookie, WRONG, NEW_PASSWORD)).status).toBe(400);

    const res = await changePassword(cookie, PASSWORD, NEW_PASSWORD);

    expect(res.status).toBe(429);
    expect(res.body).toEqual(BLOCKED_15);
    expect(await loginStatus(NEW_PASSWORD)).toBe(401);
    expect(await loginStatus(PASSWORD)).toBe(200);
  });

  // 5 nuevas de 7 caracteres (400) no cuentan: un cambio válido da 204 (AC-06)
  it('test_password_nueva_invalida_no_cuenta', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');
    for (let i = 0; i < 5; i++) expect((await changePassword(cookie, PASSWORD, 'a'.repeat(7))).status).toBe(400);

    expect((await changePassword(cookie, PASSWORD, NEW_PASSWORD)).status).toBe(204);

    // Control: el límite está activo (5 actuales incorrectas sí bloquean).
    for (let i = 0; i < 5; i++) expect((await changePassword(cookie, WRONG, 'otra-mas-nueva-1')).status).toBe(400);
    expect((await changePassword(cookie, NEW_PASSWORD, 'otra-mas-nueva-1')).status).toBe(429);
  });

  // Bloqueado, el caso de uso no se ejecuta y la respuesta tarda menos de 50 ms (AC-08)
  it('test_login_bloqueado_no_ejecuta_caso_de_uso', async () => {
    let calls = 0;
    t.cleanup();
    t = await createTestApp({
      login: {
        execute: () => {
          calls += 1;
          return Promise.reject(new InvalidCredentials());
        },
      },
    });
    await failLogins(5);
    expect(calls).toBe(5);

    for (let i = 0; i < 3; i++) {
      const started = performance.now();
      const status = await loginStatus();
      const elapsed = performance.now() - started;
      expect(status).toBe(429);
      expect(elapsed).toBeLessThan(50);
    }
    expect(calls).toBe(5);
  });

  // A 14 min 10 s del fin: 429 con "15 minutos" y Retry-After 850 (AC-09)
  it('test_login_bloqueado_mensaje_y_retry_after', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    await failLogins(5);
    t.clock.advance(50_000);

    const res = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });

    expect(res.status).toBe(429);
    expect(res.body).toEqual(BLOCKED_15);
    expect(res.headers['retry-after']).toBe('850');
  });

  // 4 fallos, éxito, 4 fallos más: el siguiente correcto da 200 (AC-10)
  it('test_login_exito_reinicia_contador', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    await failLogins(4);
    expect(await loginStatus()).toBe(200);
    await failLogins(4);

    expect(await loginStatus()).toBe(200);

    // Control: el límite está activo.
    await failLogins(5);
    expect(await loginStatus()).toBe(429);
  });

  // Con el login bloqueado, el cambio de contraseña desde la misma IP da 204 (AC-11)
  it('test_login_bloqueado_no_afecta_cambio_de_contraseña', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('admin@empresa.com');
    await failLogins(5);
    expect(await loginStatus()).toBe(429);

    const res = await changePassword(cookie, PASSWORD, NEW_PASSWORD);

    expect(res.status).toBe(204);
  });

  // El bloqueo queda en el log como login/blocked con IP y fecha, sin contraseñas (AC-12)
  it('test_bloqueo_registrado_en_log_sin_contraseñas', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    await failLogins(5);

    expect(await loginStatus()).toBe(429);

    const blocked = t.logs.filter((l) => l.record.outcome === 'blocked').map((l) => l.record);
    expect(blocked).toEqual([
      {
        event: 'login',
        outcome: 'blocked',
        email: 'admin@empresa.com',
        ip: expect.any(String) as unknown,
        at: '2026-11-04T12:00:00.000Z',
      },
    ]);
    const everything = JSON.stringify(t.logs);
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toContain(WRONG);
  });

  // El bloqueo del cambio de contraseña queda en el log con el email de la sesión, normalizado, sin contraseñas (AC-12)
  it('test_bloqueo_cambio_de_contraseña_registra_email_de_la_sesion', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    const cookie = await loginAs('Admin@Empresa.com');
    for (let i = 0; i < 5; i++) expect((await changePassword(cookie, WRONG, NEW_PASSWORD)).status).toBe(400);

    expect((await changePassword(cookie, PASSWORD, NEW_PASSWORD)).status).toBe(429);

    const blocked = t.logs.filter((l) => l.record.outcome === 'blocked').map((l) => l.record);
    expect(blocked).toEqual([
      {
        event: 'password_change',
        outcome: 'blocked',
        email: 'admin@empresa.com',
        ip: expect.any(String) as unknown,
        at: '2026-11-04T12:00:00.000Z',
      },
    ]);
    const everything = JSON.stringify(t.logs);
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toContain(WRONG);
    expect(everything).not.toContain(NEW_PASSWORD);
  });

  // Un createApp nuevo sobre la misma base (reinicio) acepta el login correcto (AC-14)
  it('test_reinicio_borra_bloqueo', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });
    await failLogins(5);
    expect(await loginStatus()).toBe(429);

    const restarted = createApp(t.deps);

    expect(await loginStatus(PASSWORD, restarted)).toBe(200);
  });
});
