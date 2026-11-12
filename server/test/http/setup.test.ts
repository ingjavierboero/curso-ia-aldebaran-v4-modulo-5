import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { responseBody } from '../support/responseBody.js';
import { type TestApp, createTestApp, sessionCookieFrom } from '../support/testApp.js';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(() => {
  t.cleanup();
});

describe('setup del primer Admin', () => {
  // GET /api/setup/status sin usuarios devuelve needsFirstAdmin true y POST /api/setup/first-admin con 8 caracteres crea Admin Activo que hace login
  it('test_setup_status_sin_usuarios_y_first_admin_con_8_caracteres_crea_admin_que_hace_login', async () => {
    const status = await request(t.app).get('/api/setup/status');
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ needsFirstAdmin: true });

    const created = await request(t.app)
      .post('/api/setup/first-admin')
      .send({ name: 'Ana Pérez', email: 'Admin@Empresa.com', password: '12345678' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      user: { id: expect.any(String) as unknown, name: 'Ana Pérez', email: 'admin@empresa.com', role: 'admin', status: 'activo' },
    });
    // el registro no inicia sesión
    expect(sessionCookieFrom(created.headers['set-cookie'])).toBeUndefined();

    const after = await request(t.app).get('/api/setup/status');
    expect(after.body).toEqual({ needsFirstAdmin: false });

    const login = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: '12345678' });
    expect(login.status).toBe(200);
    expect(responseBody(login.body, { user: 'object' }).user).toEqual(responseBody(created.body, { user: 'object' }).user);

    const registro = t.logs.find((l) => l.record.event === 'first_admin');
    expect(registro?.record).toEqual({
      event: 'first_admin',
      outcome: 'ok',
      email: 'admin@empresa.com',
      ip: expect.any(String) as unknown,
      at: '2026-11-04T12:00:00.000Z',
    });
    expect(JSON.stringify(t.logs)).not.toContain('12345678');
  });

  // POST /api/setup/first-admin con contraseña de 7 caracteres es rechazado con 400 y no crea usuario
  it('test_post_first_admin_contrasena_de_7_rechazado_400_sin_crear_usuario', async () => {
    const res = await request(t.app)
      .post('/api/setup/first-admin')
      .send({ name: 'Ana Pérez', email: 'admin@empresa.com', password: '1234567' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'La contraseña debe tener entre 8 y 1024 caracteres' });
    expect(t.countUsers()).toBe(0);
  });

  it('POST /api/setup/first-admin con campos faltantes o inválidos es rechazado con 400 y no crea usuario', async () => {
    const sinNombre = await request(t.app)
      .post('/api/setup/first-admin')
      .send({ email: 'admin@empresa.com', password: '12345678' });
    expect(sinNombre.status).toBe(400);
    expect(responseBody(sinNombre.body, { error: 'string' }).error).toMatch(/name/);

    const nombreVacio = await request(t.app)
      .post('/api/setup/first-admin')
      .send({ name: '   ', email: 'admin@empresa.com', password: '12345678' });
    expect(nombreVacio.status).toBe(400);

    const emailInvalido = await request(t.app)
      .post('/api/setup/first-admin')
      .send({ name: 'Ana', email: 'no-es-email', password: '12345678' });
    expect(emailInvalido.status).toBe(400);

    const passwordLarga = await request(t.app)
      .post('/api/setup/first-admin')
      .send({ name: 'Ana', email: 'admin@empresa.com', password: 'a'.repeat(1025) });
    expect(passwordLarga.status).toBe(400);

    const sinContentType = await request(t.app)
      .post('/api/setup/first-admin')
      .type('form')
      .send({ name: 'Ana', email: 'admin@empresa.com', password: '12345678' });
    expect(sinContentType.status).toBe(415);

    expect(t.countUsers()).toBe(0);
  });

  // POST /api/setup/first-admin con usuario existente es rechazado con 409 (conflict)
  it('test_post_first_admin_con_usuario_existente_rechazado_409', async () => {
    await t.seedUser({ email: 'admin@empresa.com' });

    const status = await request(t.app).get('/api/setup/status');
    expect(status.body).toEqual({ needsFirstAdmin: false });

    const res = await request(t.app)
      .post('/api/setup/first-admin')
      .send({ name: 'Intruso', email: 'intruso@empresa.com', password: '12345678' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: expect.any(String) as unknown });
    expect(t.countUsers()).toBe(1);
  });

  // Dos POST /api/setup/first-admin simultáneos: un 201, un 409 duplicado rechazado y un solo usuario
  it('test_dos_post_first_admin_simultaneos_un_201_un_409_y_un_solo_usuario', async () => {
    const [a, b] = await Promise.all([
      request(t.app).post('/api/setup/first-admin').send({ name: 'Ana', email: 'ana@empresa.com', password: '12345678' }),
      request(t.app).post('/api/setup/first-admin').send({ name: 'Beto', email: 'beto@empresa.com', password: '12345678' }),
    ]);

    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
    expect(t.countUsers()).toBe(1);
  });

  it('POST /api/setup/first-admin con name de más de 100 caracteres es rechazado con 400 sin ejecutar el caso de uso', async () => {
    let calls = 0;
    t.cleanup();
    t = await createTestApp({
      registerFirstAdmin: {
        execute: () => {
          calls++;
          return Promise.reject(new Error('no debería ejecutarse'));
        },
      },
    });

    const res = await request(t.app)
      .post('/api/setup/first-admin')
      .send({ name: 'a'.repeat(101), email: 'admin@empresa.com', password: '12345678' });

    expect(res.status).toBe(400);
    expect(responseBody(res.body, { error: 'string' }).error).toMatch(/name/);
    expect(calls).toBe(0);
    expect(t.logs.filter((l) => l.record.event === 'first_admin')).toHaveLength(0);
  });

  it('POST /api/setup/first-admin con email inválido se registra como invalid con email null, sin el texto crudo', async () => {
    const res = await request(t.app)
      .post('/api/setup/first-admin')
      .send({ name: 'Ana', email: 'MiClave$ecreta99', password: '12345678' });

    expect(res.status).toBe(400);
    const registros = t.logs.filter((l) => l.record.event === 'first_admin').map((l) => l.record);
    expect(registros).toEqual([
      { event: 'first_admin', outcome: 'invalid', email: null, ip: expect.any(String) as unknown, at: '2026-11-04T12:00:00.000Z' },
    ]);
    expect(JSON.stringify(t.logs).toLowerCase()).not.toContain('miclave$ecreta99');
    expect(t.countUsers()).toBe(0);
  });
});
