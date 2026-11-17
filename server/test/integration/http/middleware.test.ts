import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/infrastructure/http/app.js';
import { responseBody } from '../../support/responseBody.js';
import { type TestApp, createTestApp, sessionCookieFrom } from '../../support/testApp.js';

const HOUR = 60 * 60 * 1000;
const PASSWORD = 'contraseña-segura';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(() => {
  t.cleanup();
});

async function loginCookie(): Promise<string> {
  await t.seedUser({ email: 'admin@empresa.com' });
  const res = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });
  expect(res.status).toBe(200);
  return sessionCookieFrom(res.headers['set-cookie']) as string;
}

function clearedCookie(setCookie: string | string[] | undefined): string | undefined {
  return ([] as string[]).concat(setCookie ?? []).find((c) => c.startsWith('aldebaran_sid='));
}

describe('authMiddleware', () => {
  // GET /api/auth/session sin cookie es rechazado con 401 sin datos
  it('test_get_session_sin_cookie_rechazado_401_sin_datos', async () => {
    const res = await request(t.app).get('/api/auth/session');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Sesión no válida' });
    expect(clearedCookie(res.headers['set-cookie'])).toMatch(/^aldebaran_sid=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('GET /api/auth/session con cookie de sesión inexistente es rechazado con 401 y la cookie se borra', async () => {
    const res = await request(t.app).get('/api/auth/session').set('Cookie', 'aldebaran_sid=inventado');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Sesión no válida' });
    expect(clearedCookie(res.headers['set-cookie'])).toMatch(/^aldebaran_sid=;/);
    const rejected = t.logs.find((l) => l.record.event === 'session_rejected');
    expect(rejected?.record).toMatchObject({ path: '/api/auth/session', ip: expect.any(String) as unknown });
    expect(JSON.stringify(t.logs)).not.toContain('inventado');
  });

  // GET /api/auth/session con FakeClock 24 h después de la última actividad es rechazado con 401
  it('test_get_session_24h_despues_de_la_ultima_actividad_rechazado_401', async () => {
    const cookie = await loginCookie();

    t.clock.advance(24 * HOUR);
    const res = await request(t.app).get('/api/auth/session').set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Sesión no válida' });
    expect(clearedCookie(res.headers['set-cookie'])).toMatch(/^aldebaran_sid=;/);
  });

  // GET /api/auth/session con FakeClock 23 h después responde 200
  it('test_get_session_23h_despues_responde_200', async () => {
    const cookie = await loginCookie();

    t.clock.advance(23 * HOUR);
    const first = await request(t.app).get('/api/auth/session').set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(responseBody(first.body, { user: { email: 'string' } }).user.email).toBe('admin@empresa.com');

    // vencimiento deslizante: la actividad a las 23 h renueva la ventana
    t.clock.advance(23 * HOUR);
    const second = await request(t.app).get('/api/auth/session').set('Cookie', cookie);
    expect(second.status).toBe(200);
  });

  it('deny-by-default: cualquier ruta /api no pública sin sesión es rechazada con 401, aunque no exista', async () => {
    for (const path of ['/api/inexistente', '/api/users', '/api/setup/status/x', '/api/auth/login/extra']) {
      const res = await request(t.app).get(path);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Sesión no válida' });
    }
    const getLogin = await request(t.app).get('/api/auth/login');
    expect(getLogin.status).toBe(401);
    const postStatus = await request(t.app).post('/api/setup/status').send({});
    expect(postStatus.status).toBe(401);
  });

  it('deny-by-default: variantes de rutas públicas (mayúsculas, barra final, HEAD) sin sesión son rechazadas con 401 sin ejecutar casos de uso', async () => {
    const calls: string[] = [];
    const spy = (name: string) => ({
      execute: () => {
        calls.push(name);
        return Promise.reject(new Error('no debería ejecutarse'));
      },
    });
    t.cleanup();
    t = await createTestApp({
      login: spy('login'),
      logout: spy('logout'),
      registerFirstAdmin: spy('registerFirstAdmin'),
      getSetupStatus: {
        execute: () => {
          calls.push('getSetupStatus');
          throw new Error('no debería ejecutarse');
        },
      },
    });
    const body = { email: 'admin@empresa.com', password: PASSWORD };

    const upper = await request(t.app).post('/api/AUTH/login').send(body);
    const trailing = await request(t.app).post('/api/auth/login/').send(body);
    const head = await request(t.app).head('/api/setup/status');

    expect(upper.status).toBe(401);
    expect(upper.body).toEqual({ error: 'Sesión no válida' });
    expect(trailing.status).toBe(401);
    expect(trailing.body).toEqual({ error: 'Sesión no válida' });
    expect(head.status).toBe(401);
    expect(calls).toEqual([]);
  });

  // AC-01 / R-04: solo GET y HEAD /api/health exactos son públicos; cualquier variante exige sesión
  it('test_health_variantes_de_ruta_no_autorizado_401', async () => {
    const calls: string[] = [];
    t.cleanup();
    t = await createTestApp({
      getHealth: {
        execute: () => {
          calls.push('getHealth');
          return { status: 'ok', db: 'disponible', jobs: [] };
        },
      },
    });

    const exact = await request(t.app).get('/api/health');
    expect(exact.status).toBe(200);
    expect(calls).toEqual(['getHealth']);
    calls.length = 0;

    const trailing = await request(t.app).get('/api/health/');
    const post = await request(t.app).post('/api/health').send({});
    const upper = await request(t.app).get('/API/HEALTH');
    const mixed = await request(t.app).get('/api/Health');
    const headTrailing = await request(t.app).head('/api/health/');
    const put = await request(t.app).put('/api/health').send({});
    const sub = await request(t.app).get('/api/health/detalle');

    for (const res of [trailing, post, upper, mixed, put, sub]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Sesión no válida' });
    }
    expect(headTrailing.status).toBe(401);
    expect(calls).toEqual([]);
  });

  // FEAT-008: las tres rutas de recuperación pasan sin sesión; cualquier variante exige sesión
  it('test_middleware_rutas_de_recuperacion_publicas', async () => {
    const calls: string[] = [];
    t.cleanup();
    t = await createTestApp({
      requestPasswordReset: {
        execute: () => {
          calls.push('request');
          return 'no_user';
        },
      },
      checkPasswordResetToken: {
        execute: () => {
          calls.push('check');
        },
      },
      resetPasswordWithToken: {
        execute: () => {
          calls.push('confirm');
          return Promise.resolve();
        },
      },
    });
    const token = 'A'.repeat(43);

    const req = await request(t.app).post('/api/auth/password-reset').send({ email: 'nadie@empresa.com' });
    const check = await request(t.app).post('/api/auth/password-reset/check').send({ token });
    const confirm = await request(t.app).post('/api/auth/password-reset/confirm').send({ token, newPassword: PASSWORD });

    expect(req.status).toBe(200);
    expect(check.status).toBe(204);
    expect(confirm.status).toBe(204);
    expect(calls).toEqual(['request', 'check', 'confirm']);
    calls.length = 0;

    const variants = [
      await request(t.app).get('/api/auth/password-reset'),
      await request(t.app).put('/api/auth/password-reset').send({ email: 'nadie@empresa.com' }),
      await request(t.app).get('/api/auth/password-reset/check'),
      await request(t.app).delete('/api/auth/password-reset/confirm'),
      await request(t.app).post('/api/auth/password-reset/').send({ email: 'nadie@empresa.com' }),
      await request(t.app).post('/api/auth/PASSWORD-RESET/check').send({ token }),
      await request(t.app).post('/api/auth/password-reset/confirm/extra').send({ token, newPassword: PASSWORD }),
    ];
    for (const res of variants) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Sesión no válida' });
    }
    expect(calls).toEqual([]);
  });

  it('agregar /api/health a las rutas públicas no abre el resto de /api', async () => {
    const res = await request(t.app).get('/api/auth/session');

    expect(res.status).toBe(401);
  });

  it('con sesión válida, una ruta /api inexistente responde 404', async () => {
    const cookie = await loginCookie();

    const res = await request(t.app).get('/api/inexistente').set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'No encontrado' });
  });

  it('con secureCookie la cookie de sesión lleva Secure', async () => {
    const secureApp = createApp({ ...t.deps, secureCookie: true });
    await t.seedUser({ email: 'admin@empresa.com' });

    const res = await request(secureApp).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(clearedCookie(res.headers['set-cookie'])).toMatch(/;\s*Secure/i);
  });
});
