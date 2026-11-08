import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp, sessionCookieFrom } from '../support/testApp.js';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(() => {
  t.cleanup();
});

function expectNotFoundWithSecurityHeaders(res: request.Response): void {
  expect(res.status).toBe(404);
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  expect(res.body).toEqual({ error: 'No encontrado' });
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['x-frame-options']).toBe('DENY');
  expect(res.headers['referrer-policy']).toBe('no-referrer');
  expect(res.headers['x-powered-by']).toBeUndefined();
}

describe('createApp', () => {
  it('GET /api/inexistente responde 404 rechazado con JSON y headers de seguridad', async () => {
    // /api niega por defecto (FR-01): con sesión válida, la ruta inexistente llega al 404.
    await t.seedUser({ email: 'admin@empresa.com' });
    const login = await request(t.app)
      .post('/api/auth/login')
      .send({ email: 'admin@empresa.com', password: 'contraseña-segura' });
    expect(login.status).toBe(200);
    const cookie = sessionCookieFrom(login.headers['set-cookie']) as string;

    const res = await request(t.app).get('/api/inexistente').set('Cookie', cookie);

    expectNotFoundWithSecurityHeaders(res);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /inexistente (fuera de /api) responde 404 rechazado con JSON y headers de seguridad', async () => {
    const res = await request(t.app).get('/inexistente');

    expectNotFoundWithSecurityHeaders(res);
  });

  it('las respuestas de /api llevan los headers de seguridad y Cache-Control no-store', async () => {
    const res = await request(t.app).get('/api/setup/status');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
