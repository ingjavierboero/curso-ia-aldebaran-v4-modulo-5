import request from 'supertest';
import { expect } from 'vitest';
import type { UserRole } from '../../src/domain/user/User.js';
import { type TestApp, sessionCookieFrom } from './testApp.js';

/** La contraseña con que `TestApp.seedUser` siembra a los usuarios por defecto. */
export const TEST_PASSWORD = 'contraseña-segura';

/** Inicia sesión por HTTP y devuelve la cookie `aldebaran_sid=<valor>`. */
export async function loginAs(t: TestApp, email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await request(t.app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  const cookie = sessionCookieFrom(res.headers['set-cookie']);
  expect(cookie).toBeDefined();
  return cookie as string;
}

/** Siembra un usuario Activo del perfil pedido (`<perfil>@empresa.com`) y devuelve su cookie de sesión. */
export async function sessionAs(t: TestApp, role: UserRole): Promise<string> {
  const email = `${role}@empresa.com`;
  await t.seedUser({ email, name: `Usuario ${role}`, role });
  return loginAs(t, email);
}
