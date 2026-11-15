import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User, UserRole, UserStatus } from '../../src/domain/user/User.js';
import { responseBody } from '../support/responseBody.js';
import { type TestApp, createTestApp, sessionCookieFrom } from '../support/testApp.js';

const PASSWORD = 'contraseña-segura';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(() => {
  t.cleanup();
});

async function loginAs(email: string, password = PASSWORD): Promise<string> {
  const res = await request(t.app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  const cookie = sessionCookieFrom(res.headers['set-cookie']);
  expect(cookie).toBeDefined();
  return cookie as string;
}

/** Un Admin Activo sembrado y con sesión iniciada. */
async function adminSession(email = 'admin@empresa.com', name = 'Ana Admin'): Promise<{ user: User; cookie: string }> {
  const user = await t.seedUser({ email, name, role: 'admin' });
  return { user, cookie: await loginAs(email) };
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  password_hash: string;
}

function rowOf(id: string): UserRow | undefined {
  return t.db.$client
    .prepare('SELECT id, name, email, role, status, password_hash FROM users WHERE id = ?')
    .get(id) as UserRow | undefined;
}

function allRows(): UserRow[] {
  return t.db.$client
    .prepare('SELECT id, name, email, role, status, password_hash FROM users ORDER BY id')
    .all() as UserRow[];
}

function countSessionsOf(userId: string): number {
  const row = t.db.$client.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(userId) as {
    n: number;
  };
  return row.n;
}

function countActiveAdmins(): number {
  const row = t.db.$client
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'activo'")
    .get() as { n: number };
  return row.n;
}

describe('GET /api/users', () => {
  // AC-01, AC-12: Activos e Inactivos con nombre, email, perfil y estado; nunca el hash
  it('test_users_admin_lista_activos_e_inactivos_sin_hash', async () => {
    const { user: admin, cookie } = await adminSession('admin@empresa.com', 'Ana Admin');
    const inactivo = await t.seedUser({
      email: 'beto@empresa.com',
      name: 'Beto Inactivo',
      role: 'editor',
      status: 'inactivo',
    });

    const res = await request(t.app).get('/api/users').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      users: [
        { id: admin.id, name: 'Ana Admin', email: 'admin@empresa.com', role: 'admin', status: 'activo' },
        { id: inactivo.id, name: 'Beto Inactivo', email: 'beto@empresa.com', role: 'editor', status: 'inactivo' },
      ],
    });
    expect(res.text).not.toMatch(/passwordHash|password_hash|argon2/i);
  });

  it('sin sesión es rechazado con 401', async () => {
    await t.seedUser();

    const res = await request(t.app).get('/api/users');

    expect(res.status).toBe(401);
  });
});

describe('autorización por perfil', () => {
  // AC-13, AC-14: Editor y Consulta reciben 403 sin datos en las 5 rutas, con bodies válidos, y nada cambia
  it('test_users_editor_y_consulta_no_autorizado_403_sin_datos', async () => {
    const target = await t.seedUser({ email: 'admin@empresa.com', name: 'Ana Admin', role: 'admin' });
    const inactivo = await t.seedUser({ email: 'inactivo@empresa.com', name: 'Iñaki', role: 'consulta', status: 'inactivo' });
    await t.seedUser({ email: 'editor@empresa.com', name: 'Eva Editor', role: 'editor' });
    await t.seedUser({ email: 'consulta@empresa.com', name: 'Carlos Consulta', role: 'consulta' });
    const before = allRows();

    for (const email of ['editor@empresa.com', 'consulta@empresa.com']) {
      const cookie = await loginAs(email);
      const responses = [
        await request(t.app).get('/api/users').set('Cookie', cookie),
        await request(t.app)
          .post('/api/users')
          .set('Cookie', cookie)
          .send({ name: 'Nuevo', email: 'nuevo@empresa.com', role: 'editor', password: '12345678' }),
        await request(t.app).patch(`/api/users/${target.id}`).set('Cookie', cookie).send({ role: 'consulta' }),
        await request(t.app).post(`/api/users/${target.id}/deactivate`).set('Cookie', cookie).send({}),
        await request(t.app).post(`/api/users/${inactivo.id}/reactivate`).set('Cookie', cookie).send({}),
      ];
      for (const res of responses) {
        expect(res.status).toBe(403);
        expect(Object.keys(res.body as object)).toEqual(['error']);
        expect(responseBody(res.body, { error: 'string' }).error).not.toContain('@');
      }
    }

    expect(allRows()).toEqual(before);
  });

  it('la forma del body se valida antes que el permiso: un Editor con body mal formado recibe 400', async () => {
    const target = await t.seedUser({ email: 'admin@empresa.com', role: 'admin' });
    await t.seedUser({ email: 'editor@empresa.com', role: 'editor' });
    const cookie = await loginAs('editor@empresa.com');

    const patch = await request(t.app).patch(`/api/users/${target.id}`).set('Cookie', cookie).send({});
    const post = await request(t.app).post('/api/users').set('Cookie', cookie).send({ name: 'x' });

    expect(patch.status).toBe(400);
    expect(post.status).toBe(400);
  });
});

describe('POST /api/users', () => {
  // AC-02: alta Activa con perfil Editor y el nuevo usuario inicia sesión
  it('test_users_alta_201_y_el_nuevo_usuario_inicia_sesion', async () => {
    const { cookie } = await adminSession();

    const res = await request(t.app)
      .post('/api/users')
      .set('Cookie', cookie)
      .send({ name: 'Eva Editor', email: 'Eva@Empresa.com', role: 'editor', password: '12345678' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: {
        id: expect.any(String) as unknown,
        name: 'Eva Editor',
        email: 'eva@empresa.com',
        role: 'editor',
        status: 'activo',
      },
    });
    const created = responseBody(res.body, { user: { id: 'string' } }).user;
    // NFR-01: la contraseña se guarda hasheada con argon2id
    expect(rowOf(created.id)?.password_hash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(t.logs)).not.toContain('12345678');

    const login = await request(t.app).post('/api/auth/login').send({ email: 'eva@empresa.com', password: '12345678' });
    expect(login.status).toBe(200);
    expect(responseBody(login.body, { user: { id: 'string', role: 'string' } }).user).toMatchObject({
      id: created.id,
      role: 'editor',
    });
  });

  // AC-03: email existente en otra capitalización → 409 y no se crea nada
  it('test_users_alta_email_duplicado_409', async () => {
    const { cookie } = await adminSession();
    await t.seedUser({ email: 'ana@empresa.com', name: 'Ana', role: 'editor' });
    const before = t.countUsers();

    const res = await request(t.app)
      .post('/api/users')
      .set('Cookie', cookie)
      .send({ name: 'Otra Ana', email: 'Ana@Empresa.com', role: 'consulta', password: '12345678' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Ya existe un usuario con ese email' });
    expect(t.countUsers()).toBe(before);
  });

  // AC-05: contraseña de 7 caracteres → 400 y no se crea nada
  it('test_users_alta_contrasena_corta_400', async () => {
    const { cookie } = await adminSession();
    const before = t.countUsers();

    const res = await request(t.app)
      .post('/api/users')
      .set('Cookie', cookie)
      .send({ name: 'Eva', email: 'eva@empresa.com', role: 'editor', password: '1234567' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'La contraseña debe tener entre 8 y 1024 caracteres' });
    expect(t.countUsers()).toBe(before);
  });

  // AC-19: nombre vacío, de 101 caracteres, email inválido, perfil desconocido, campo faltante → 400
  it('test_users_alta_body_invalido_400', async () => {
    const { cookie } = await adminSession();
    const before = t.countUsers();
    const valid = { name: 'Eva', email: 'eva@empresa.com', role: 'editor', password: '12345678' };

    const cases: { body: unknown; error: RegExp }[] = [
      { body: { ...valid, name: '   ' }, error: /nombre/i },
      { body: { ...valid, name: 'a'.repeat(101) }, error: /name/ },
      { body: { ...valid, email: 'no-es-email' }, error: /email/i },
      { body: { ...valid, email: `${'a'.repeat(250)}@empresa.com` }, error: /email/ },
      { body: { ...valid, role: 'superadmin' }, error: /perfil/i },
      { body: { ...valid, role: 'a'.repeat(21) }, error: /role/ },
      { body: { ...valid, password: 'a'.repeat(1025) }, error: /password/ },
      { body: { name: 'Eva', email: 'eva@empresa.com', password: '12345678' }, error: /role/ },
      { body: { ...valid, name: 42 }, error: /name/ },
      { body: [valid], error: /objeto/ },
    ];
    for (const { body, error } of cases) {
      const res = await request(t.app).post('/api/users').set('Cookie', cookie).send(body as object);
      expect(res.status).toBe(400);
      expect(responseBody(res.body, { error: 'string' }).error).toMatch(error);
    }

    const sinJson = await request(t.app).post('/api/users').set('Cookie', cookie).type('form').send(valid);
    expect(sinJson.status).toBe(415);

    expect(t.countUsers()).toBe(before);
  });
});

describe('PATCH /api/users/:id', () => {
  it('test_users_modificar_sin_campos_invalido_400', async () => {
    const { cookie } = await adminSession();
    const target = await t.seedUser({ email: 'eva@empresa.com', name: 'Eva', role: 'editor' });
    const before = rowOf(target.id);

    const empty = await request(t.app).patch(`/api/users/${target.id}`).set('Cookie', cookie).send({});
    expect(empty.status).toBe(400);
    expect(responseBody(empty.body, { error: 'string' }).error).toMatch(/name.*email.*role/);

    const wrongType = await request(t.app).patch(`/api/users/${target.id}`).set('Cookie', cookie).send({ name: 42 });
    expect(wrongType.status).toBe(400);
    expect(responseBody(wrongType.body, { error: 'string' }).error).toMatch(/name/);

    const tooLong = await request(t.app)
      .patch(`/api/users/${target.id}`)
      .set('Cookie', cookie)
      .send({ name: 'a'.repeat(101) });
    expect(tooLong.status).toBe(400);

    const unknownOnly = await request(t.app)
      .patch(`/api/users/${target.id}`)
      .set('Cookie', cookie)
      .send({ password: 'otra-contraseña' });
    expect(unknownOnly.status).toBe(400);

    expect(rowOf(target.id)).toEqual(before);
  });

  // AC-06: nombre y email nuevos, en el listado, y login con el email nuevo
  it('test_users_modificar_nombre_email_y_login_con_email_nuevo', async () => {
    const { cookie } = await adminSession();
    const target = await t.seedUser({ email: 'eva@empresa.com', name: 'Eva', role: 'editor' });

    const res = await request(t.app)
      .patch(`/api/users/${target.id}`)
      .set('Cookie', cookie)
      .send({ name: 'Eva Gómez', email: 'Eva.Gomez@Empresa.com' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: target.id, name: 'Eva Gómez', email: 'eva.gomez@empresa.com', role: 'editor', status: 'activo' },
    });

    const list = await request(t.app).get('/api/users').set('Cookie', cookie);
    expect(responseBody(list.body, { users: 'unknown' }).users).toContainEqual({
      id: target.id,
      name: 'Eva Gómez',
      email: 'eva.gomez@empresa.com',
      role: 'editor',
      status: 'activo',
    });

    const oldLogin = await request(t.app).post('/api/auth/login').send({ email: 'eva@empresa.com', password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    await loginAs('eva.gomez@empresa.com');
  });

  // AC-04: el email de otro usuario → 409 y conserva su email
  it('test_users_modificar_email_duplicado_409', async () => {
    const { cookie } = await adminSession();
    await t.seedUser({ email: 'ana@empresa.com', name: 'Ana', role: 'editor' });
    const target = await t.seedUser({ email: 'eva@empresa.com', name: 'Eva', role: 'editor' });

    const res = await request(t.app)
      .patch(`/api/users/${target.id}`)
      .set('Cookie', cookie)
      .send({ name: 'Eva Nueva', email: 'Ana@Empresa.com' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Ya existe un usuario con ese email' });
    expect(rowOf(target.id)).toMatchObject({ name: 'Eva', email: 'eva@empresa.com' });
  });

  // AC-07: un Admin pasado a Editor recibe 403 en su siguiente GET /api/users, sin volver a iniciar sesión
  it('test_users_cambio_de_perfil_rige_en_la_siguiente_solicitud', async () => {
    const { cookie: adminCookie } = await adminSession('admin@empresa.com');
    const { user: other, cookie: otherCookie } = await adminSession('otro@empresa.com', 'Otro Admin');

    const before = await request(t.app).get('/api/users').set('Cookie', otherCookie);
    expect(before.status).toBe(200);

    const change = await request(t.app).patch(`/api/users/${other.id}`).set('Cookie', adminCookie).send({ role: 'editor' });
    expect(change.status).toBe(200);
    expect(responseBody(change.body, { user: { role: 'string' } }).user.role).toBe('editor');

    const after = await request(t.app).get('/api/users').set('Cookie', otherCookie);
    expect(after.status).toBe(403);
    expect(Object.keys(after.body as object)).toEqual(['error']);

    // la sesión sigue siendo válida: solo cambiaron los permisos
    const session = await request(t.app).get('/api/auth/session').set('Cookie', otherCookie);
    expect(session.status).toBe(200);
    expect(responseBody(session.body, { user: { role: 'string' } }).user.role).toBe('editor');
  });
});

describe('POST /api/users/:id/deactivate y /reactivate', () => {
  // AC-08, AC-15: Inactivo, sus 2 sesiones rechazadas como no autenticadas y su login rechazado
  it('test_users_baja_cierra_las_dos_sesiones_y_rechaza_login', async () => {
    const { cookie } = await adminSession();
    const target = await t.seedUser({ email: 'eva@empresa.com', name: 'Eva', role: 'editor' });
    const s1 = await loginAs('eva@empresa.com');
    const s2 = await loginAs('eva@empresa.com');
    expect(countSessionsOf(target.id)).toBe(2);

    const res = await request(t.app).post(`/api/users/${target.id}/deactivate`).set('Cookie', cookie).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: target.id, name: 'Eva', email: 'eva@empresa.com', role: 'editor', status: 'inactivo' },
    });
    expect(countSessionsOf(target.id)).toBe(0);
    for (const s of [s1, s2]) {
      const next = await request(t.app).get('/api/auth/session').set('Cookie', s);
      expect(next.status).toBe(401);
    }
    const login = await request(t.app).post('/api/auth/login').send({ email: 'eva@empresa.com', password: PASSWORD });
    expect(login.status).toBe(401);
    // la sesión del Admin que dio la baja sigue
    expect((await request(t.app).get('/api/users').set('Cookie', cookie)).status).toBe(200);
  });

  // AC-09: reactivado, vuelve a iniciar sesión
  it('test_users_reactivar_permite_login', async () => {
    const { cookie } = await adminSession();
    const target = await t.seedUser({ email: 'eva@empresa.com', name: 'Eva', role: 'editor', status: 'inactivo' });
    const blocked = await request(t.app).post('/api/auth/login').send({ email: 'eva@empresa.com', password: PASSWORD });
    expect(blocked.status).toBe(401);

    const res = await request(t.app).post(`/api/users/${target.id}/reactivate`).set('Cookie', cookie).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: target.id, name: 'Eva', email: 'eva@empresa.com', role: 'editor', status: 'activo' },
    });
    await loginAs('eva@empresa.com');
  });

  // AC-10: el único Admin Activo no se da de baja ni cambia de perfil; sigue Activo y Admin
  it('test_users_ultimo_admin_baja_o_cambio_de_perfil_409', async () => {
    const { user: admin, cookie } = await adminSession();
    // un Admin Inactivo no cuenta
    await t.seedUser({ email: 'viejo@empresa.com', role: 'admin', status: 'inactivo' });

    const baja = await request(t.app).post(`/api/users/${admin.id}/deactivate`).set('Cookie', cookie).send({});
    expect(baja.status).toBe(409);
    expect(baja.body).toEqual({ error: 'No se puede dejar el sistema sin un Admin Activo' });

    const perfil = await request(t.app).patch(`/api/users/${admin.id}`).set('Cookie', cookie).send({ role: 'editor' });
    expect(perfil.status).toBe(409);
    expect(perfil.body).toEqual({ error: 'No se puede dejar el sistema sin un Admin Activo' });

    expect(rowOf(admin.id)).toMatchObject({ role: 'admin', status: 'activo' });
    expect(countSessionsOf(admin.id)).toBe(1);
  });

  // AC-11: con 2 Admin Activos, la baja de uno se realiza
  it('test_users_con_dos_admins_la_baja_se_realiza', async () => {
    const { cookie } = await adminSession('admin@empresa.com');
    const other = await t.seedUser({ email: 'otro@empresa.com', name: 'Otro Admin', role: 'admin' });

    const res = await request(t.app).post(`/api/users/${other.id}/deactivate`).set('Cookie', cookie).send({});

    expect(res.status).toBe(200);
    expect(responseBody(res.body, { user: { status: 'string' } }).user.status).toBe('inactivo');
    expect(rowOf(other.id)?.status).toBe('inactivo');
    expect(countActiveAdmins()).toBe(1);
  });

  // AC-18 (NFR-02): 2 Admin se dan de baja entre sí a la vez; como mucho una baja y queda ≥ 1 Admin Activo
  it('test_users_bajas_simultaneas_entre_dos_admins_conflicto_rechazado', async () => {
    const { user: a, cookie: cookieA } = await adminSession('a@empresa.com', 'Admin A');
    const { user: b, cookie: cookieB } = await adminSession('b@empresa.com', 'Admin B');

    const [resA, resB] = await Promise.all([
      request(t.app).post(`/api/users/${b.id}/deactivate`).set('Cookie', cookieA).send({}),
      request(t.app).post(`/api/users/${a.id}/deactivate`).set('Cookie', cookieB).send({}),
    ]);

    const statuses = [resA.status, resB.status];
    // En un proceso las 2 transacciones no intercalan: exactamente una baja se realiza (la spec acepta
    // que este test no distingue IMMEDIATE de DEFERRED). Exigir el 200 evita que "ambas rechazadas" pase.
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    // la otra solicitud queda rechazada: sesión cerrada (401), actor ya no Admin Activo (403) o último Admin (409)
    for (const s of statuses.filter((x) => x !== 200)) expect([401, 403, 409]).toContain(s);
    expect(countActiveAdmins()).toBe(1);
  });

  it('test_users_inexistente_404', async () => {
    const { cookie } = await adminSession();
    const before = allRows();

    const responses = [
      await request(t.app).patch('/api/users/no-existe').set('Cookie', cookie).send({ name: 'Nadie' }),
      await request(t.app).post('/api/users/no-existe/deactivate').set('Cookie', cookie).send({}),
      await request(t.app).post('/api/users/no-existe/reactivate').set('Cookie', cookie).send({}),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'El usuario no existe' });
    }
    expect(allRows()).toEqual(before);
  });
});
