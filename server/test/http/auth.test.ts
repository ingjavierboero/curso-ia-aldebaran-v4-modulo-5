import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJsonLogger } from '../../src/infrastructure/http/authLog.js';
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
  it('POST /api/auth/login con credenciales válidas responde 200, PublicUser y cookie httpOnly SameSite=Strict', async () => {
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

  it('POST /api/auth/login con email en mayúsculas inicia sesión', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    const res = await request(t.app).post('/api/auth/login').send({ email: 'Admin@Empresa.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@empresa.com');
    expect(sessionCookieFrom(res.headers['set-cookie'])).toBeDefined();
  });

  it('POST /api/auth/login con contraseña incorrecta, email inexistente o usuario Inactivo es rechazado con 401 y el mismo mensaje', async () => {
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

  it('POST /api/auth/login con campo faltante es rechazado con 400', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    const sinPassword = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com' });
    expect(sinPassword.status).toBe(400);
    expect(sinPassword.body.error).toMatch(/password/);

    const sinEmail = await request(t.app).post('/api/auth/login').send({ password: PASSWORD });
    expect(sinEmail.status).toBe(400);
    expect(sinEmail.body.error).toMatch(/email/);

    const tipoInvalido = await request(t.app).post('/api/auth/login').send({ email: 123, password: PASSWORD });
    expect(tipoInvalido.status).toBe(400);
    expect(tipoInvalido.body.error).toMatch(/email/);

    expect(countSessions()).toBe(0);
  });

  it('POST /api/auth/login sin Content-Type JSON es rechazado con 415', async () => {
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
        execute: async () => {
          calls += 1;
          throw new Error('no debería ejecutarse');
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
        execute: async () => {
          calls += 1;
          throw new Error('no debería ejecutarse');
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
    expect(res.body.error).toMatch(/password/);
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
    expect(res.body).toEqual({ error: expect.any(String) });
  });
});

describe('POST /api/auth/logout', () => {
  it('POST /api/auth/logout y luego GET /api/auth/session con la misma cookie es rechazado con 401', async () => {
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

describe('FR-08 y errores', () => {
  it('Ninguna respuesta de login, first-admin ni session contiene passwordHash ni password_hash', async () => {
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
      expect(Object.keys(res.body.user).sort()).toEqual(['email', 'id', 'name', 'role', 'status']);
      expect(res.text).not.toMatch(/passwordHash|password_hash|\$argon2/);
    }
  });

  it('Error inesperado en un caso de uso responde 500 sin stack (error)', async () => {
    t.cleanup();
    t = await createTestApp({
      login: {
        execute: async () => {
          throw new Error('SQLITE_BUSY: detalle interno /ruta/secreta');
        },
      },
    });

    const res = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno' });
    expect(res.text).not.toMatch(/SQLITE_BUSY|secreta|at |\.ts/);
    const errorLog = t.logs.find((l) => l.level === 'error');
    expect(JSON.stringify(errorLog?.record)).toMatch(/SQLITE_BUSY/);
  });
});

describe('authLog', () => {
  it('authLog registra el intento de login sin la contraseña', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    await request(t.app).post('/api/auth/login').send({ email: 'Admin@Empresa.com', password: PASSWORD });
    await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: 'clave-equivocada' });

    const attempts = t.logs.filter((l) => l.record.event === 'login').map((l) => l.record);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual({
      event: 'login',
      outcome: 'ok',
      email: 'admin@empresa.com',
      ip: expect.any(String),
      at: '2026-11-04T12:00:00.000Z',
    });
    expect(attempts[1]).toMatchObject({ event: 'login', outcome: 'invalid', email: 'admin@empresa.com' });

    const everything = JSON.stringify(t.logs);
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toContain('clave-equivocada');
    expect(everything).not.toMatch(/aldebaran_sid|token/i);
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
