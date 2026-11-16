import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '../../src/domain/client/Client.js';
import { Cuit } from '../../src/domain/client/Cuit.js';
import { IvaCondition } from '../../src/domain/client/IvaCondition.js';
import { Price } from '../../src/domain/product/Price.js';
import { Product } from '../../src/domain/product/Product.js';
import { Email } from '../../src/domain/shared/Email.js';
import type { UserRole } from '../../src/domain/user/User.js';
import { DrizzleClientRepository } from '../../src/infrastructure/db/DrizzleClientRepository.js';
import { DrizzleProductRepository } from '../../src/infrastructure/db/DrizzleProductRepository.js';
import { CUITS, cuitsFor } from '../support/catalogContext.js';
import { sessionAs as sessionOf } from '../support/httpSession.js';
import { responseBody } from '../support/responseBody.js';
import { type TestApp, createTestApp } from '../support/testApp.js';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(() => {
  t.cleanup();
});

const sessionAs = (role: UserRole): Promise<string> => sessionOf(t, role);

const LOS_ANDES = {
  businessName: 'Los Andes S.A.',
  cuit: CUITS.losAndes,
  address: 'Av. Siempre Viva 742',
  billingEmail: 'pagos@losandes.com',
  ivaCondition: 1,
} as const;

const DEL_SUR = {
  businessName: 'Del Sur SRL',
  cuit: CUITS.delSur,
  address: 'San Martín 100',
  billingEmail: 'admin@delsur.com',
  ivaCondition: 6,
} as const;

interface ClientRow {
  id: string;
  business_name: string;
  cuit: string;
  address: string;
  billing_email: string;
  iva_condition: number;
  status: string;
}

function clientRows(): ClientRow[] {
  return t.db.$client
    .prepare('SELECT id, business_name, cuit, address, billing_email, iva_condition, status FROM clients ORDER BY id')
    .all() as ClientRow[];
}

function assignmentRows(): Array<{ client_id: string; product_id: string }> {
  return t.db.$client
    .prepare('SELECT client_id, product_id FROM client_products ORDER BY client_id, product_id')
    .all() as Array<{ client_id: string; product_id: string }>;
}

async function createClient(cookie: string, body: object): Promise<string> {
  const res = await request(t.app).post('/api/clients').set('Cookie', cookie).send(body);
  expect(res.status).toBe(201);
  return responseBody(res.body, { client: { id: 'string' } }).client.id;
}

async function createProduct(cookie: string, name: string, price = '15000.50', currency = 'ARS'): Promise<string> {
  const res = await request(t.app).post('/api/products').set('Cookie', cookie).send({ name, price, currency });
  expect(res.status).toBe(201);
  return responseBody(res.body, { product: { id: 'string' } }).product.id;
}

function productNamesOf(body: unknown): string[] {
  const { client } = responseBody(body, { client: { products: 'unknown' } });
  return (client.products as Array<{ name: string }>).map((product) => product.name);
}

describe('clientes por HTTP', () => {
  // AC-01: el alta responde 201 con el cliente Activo y aparece en el listado
  it('test_http_alta_cliente_aparece_en_listado', async () => {
    const cookie = await sessionAs('editor');

    const created = await request(t.app)
      .post('/api/clients')
      .set('Cookie', cookie)
      .send({ ...LOS_ANDES, cuit: '30-71111111-1', billingEmail: 'Pagos@LosAndes.com' });

    expect(created.status).toBe(201);
    const { client } = responseBody(created.body, { client: { id: 'string', createdAt: 'string' } });
    expect(created.body).toEqual({
      client: {
        id: client.id,
        businessName: 'Los Andes S.A.',
        cuit: '30711111111',
        address: 'Av. Siempre Viva 742',
        billingEmail: 'pagos@losandes.com',
        ivaCondition: { code: 1, name: 'IVA Responsable Inscripto' },
        status: 'activo',
        createdAt: t.clock.now().toISOString(),
      },
    });

    const list = await request(t.app).get('/api/clients').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ clients: [client] });
  });

  // AC-02: faltando cualquiera de los 5 campos → 400 y no se crea nada
  it('test_http_alta_cliente_sin_campos_rechazado', async () => {
    const cookie = await sessionAs('admin');

    for (const field of Object.keys(LOS_ANDES)) {
      const body: Record<string, unknown> = { ...LOS_ANDES };
      delete body[field];
      const res = await request(t.app).post('/api/clients').set('Cookie', cookie).send(body);
      expect(res.status, `sin ${field}`).toBe(400);
      expect(responseBody(res.body, { error: 'string' }).error).toContain(field);
    }
    // Vacíos o en blanco: los rechaza el dominio, también con 400.
    for (const field of ['businessName', 'address', 'billingEmail', 'cuit']) {
      const res = await request(t.app)
        .post('/api/clients')
        .set('Cookie', cookie)
        .send({ ...LOS_ANDES, [field]: '   ' });
      expect(res.status, `${field} en blanco`).toBe(400);
    }
    // De más de 200 caracteres: 400.
    const long = await request(t.app)
      .post('/api/clients')
      .set('Cookie', cookie)
      .send({ ...LOS_ANDES, businessName: 'x'.repeat(201) });
    expect(long.status).toBe(400);

    expect(clientRows()).toEqual([]);
  });

  // AC-03: la modificación cambia los datos y el detalle los muestra
  it('test_http_modificar_cliente_y_ver_detalle', async () => {
    const cookie = await sessionAs('editor');
    const id = await createClient(cookie, LOS_ANDES);

    const patched = await request(t.app)
      .patch(`/api/clients/${id}`)
      .set('Cookie', cookie)
      .send({ businessName: 'Los Andes Sociedad Anónima', address: 'Belgrano 55', ivaCondition: 4 });

    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      client: {
        id,
        businessName: 'Los Andes Sociedad Anónima',
        address: 'Belgrano 55',
        cuit: CUITS.losAndes,
        billingEmail: 'pagos@losandes.com',
        ivaCondition: { code: 4, name: 'IVA Sujeto Exento' },
      },
    });

    const detail = await request(t.app).get(`/api/clients/${id}`).set('Cookie', cookie);
    expect(detail.status).toBe(200);
    const patchedClient = responseBody(patched.body, { client: 'object' }).client;
    expect(detail.body).toEqual({ client: { ...patchedClient, products: [] } });

    // Sin ningún campo reconocido → 400, y nada cambia.
    const before = clientRows();
    const empty = await request(t.app).patch(`/api/clients/${id}`).set('Cookie', cookie).send({ foo: 'bar' });
    expect(empty.status).toBe(400);
    // Inexistente → 404.
    const missing = await request(t.app).get('/api/clients/no-existe').set('Cookie', cookie);
    expect(missing.status).toBe(404);
    const missingPatch = await request(t.app)
      .patch('/api/clients/no-existe')
      .set('Cookie', cookie)
      .send({ address: 'X 1' });
    expect(missingPatch.status).toBe(404);
    // Un id de más de 64 caracteres → 400.
    const longId = await request(t.app).get(`/api/clients/${'a'.repeat(65)}`).set('Cookie', cookie);
    expect(longId.status).toBe(400);
    expect(clientRows()).toEqual(before);
  });

  // AC-04: baja → Inactivo y sigue listado; reactivación → Activo; ambas idempotentes
  it('test_http_baja_y_reactivacion_cliente', async () => {
    const cookie = await sessionAs('admin');
    const id = await createClient(cookie, LOS_ANDES);

    const off = await request(t.app).post(`/api/clients/${id}/deactivate`).set('Cookie', cookie).send({});
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ client: { id, status: 'inactivo' } });
    const offAgain = await request(t.app).post(`/api/clients/${id}/deactivate`).set('Cookie', cookie).send({});
    expect(offAgain.status).toBe(200);
    expect(offAgain.body).toMatchObject({ client: { id, status: 'inactivo' } });

    const list = await request(t.app).get('/api/clients').set('Cookie', cookie);
    expect(list.body).toMatchObject({ clients: [{ id, status: 'inactivo' }] });

    const on = await request(t.app).post(`/api/clients/${id}/reactivate`).set('Cookie', cookie).send({});
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ client: { id, status: 'activo' } });
    expect(clientRows()).toMatchObject([{ id, status: 'activo' }]);

    const missing = await request(t.app).post('/api/clients/no-existe/deactivate').set('Cookie', cookie).send({});
    expect(missing.status).toBe(404);
  });

  // AC-05: condición IVA fuera de la lista (2, 99) o como texto ("5") → 400, en alta y modificación
  it('test_http_condicion_iva_invalida_rechazada', async () => {
    const cookie = await sessionAs('editor');

    for (const ivaCondition of [2, 99, '5', 5.5]) {
      const res = await request(t.app)
        .post('/api/clients')
        .set('Cookie', cookie)
        .send({ ...LOS_ANDES, ivaCondition });
      expect(res.status, `alta con ${JSON.stringify(ivaCondition)}`).toBe(400);
      expect(responseBody(res.body, { error: 'string' }).error).not.toBe('');
    }
    expect(clientRows()).toEqual([]);

    const id = await createClient(cookie, LOS_ANDES);
    const before = clientRows();
    for (const ivaCondition of [2, 99, '5']) {
      const res = await request(t.app).patch(`/api/clients/${id}`).set('Cookie', cookie).send({ ivaCondition });
      expect(res.status, `modificación con ${JSON.stringify(ivaCondition)}`).toBe(400);
    }
    expect(clientRows()).toEqual(before);
  });

  // AC-06: dígito verificador o prefijo inválido → 400 y nada cambia; el CUIT válido → 201
  it('test_http_cuit_invalido_rechazado', async () => {
    const cookie = await sessionAs('editor');

    for (const cuit of ['30711111118', '00000000000']) {
      const res = await request(t.app)
        .post('/api/clients')
        .set('Cookie', cookie)
        .send({ ...LOS_ANDES, cuit });
      expect(res.status, `alta con ${cuit}`).toBe(400);
      expect(responseBody(res.body, { error: 'string' }).error).toBe('El CUIT no es válido');
    }
    expect(clientRows()).toEqual([]);

    const ok = await request(t.app).post('/api/clients').set('Cookie', cookie).send(LOS_ANDES);
    expect(ok.status).toBe(201);
    const id = responseBody(ok.body, { client: { id: 'string' } }).client.id;

    const before = clientRows();
    for (const cuit of ['30711111118', '00000000000']) {
      const res = await request(t.app).patch(`/api/clients/${id}`).set('Cookie', cookie).send({ cuit });
      expect(res.status, `modificación con ${cuit}`).toBe(400);
    }
    // Un número JSON no es un CUIT: 400 por forma.
    const numeric = await request(t.app).patch(`/api/clients/${id}`).set('Cookie', cookie).send({ cuit: 30711111111 });
    expect(numeric.status).toBe(400);
    expect(clientRows()).toEqual(before);
  });

  // AC-07: CUIT o email de facturación de otro cliente → 409, en alta y modificación, y nada cambia
  it('test_http_cuit_y_email_duplicados_conflict', async () => {
    const cookie = await sessionAs('admin');
    await createClient(cookie, LOS_ANDES);
    const delSurId = await createClient(cookie, DEL_SUR);
    const before = clientRows();

    const sameCuit = await request(t.app)
      .post('/api/clients')
      .set('Cookie', cookie)
      .send({ ...DEL_SUR, cuit: CUITS.losAndes, billingEmail: 'otro@delsur.com' });
    expect(sameCuit.status).toBe(409);
    expect(sameCuit.body).toEqual({ error: 'Ya existe un cliente con ese CUIT' });

    const sameEmail = await request(t.app)
      .post('/api/clients')
      .set('Cookie', cookie)
      .send({ ...LOS_ANDES, cuit: CUITS.norte, billingEmail: 'PAGOS@losandes.com' });
    expect(sameEmail.status).toBe(409);
    expect(sameEmail.body).toEqual({ error: 'Ya existe un cliente con ese email de facturación' });

    const patchCuit = await request(t.app)
      .patch(`/api/clients/${delSurId}`)
      .set('Cookie', cookie)
      .send({ cuit: CUITS.losAndes });
    expect(patchCuit.status).toBe(409);
    const patchEmail = await request(t.app)
      .patch(`/api/clients/${delSurId}`)
      .set('Cookie', cookie)
      .send({ billingEmail: 'Pagos@LosAndes.com' });
    expect(patchEmail.status).toBe(409);

    expect(clientRows()).toEqual(before);
  });
});

describe('asignaciones por HTTP', () => {
  // AC-13: se asignan dos productos a un cliente Inactivo y el detalle los muestra
  it('test_http_asignar_dos_productos_a_cliente_inactivo', async () => {
    const cookie = await sessionAs('editor');
    const clientId = await createClient(cookie, LOS_ANDES);
    await request(t.app).post(`/api/clients/${clientId}/deactivate`).set('Cookie', cookie).send({});
    const turnos = await createProduct(cookie, 'Sistema de Turnos');
    const stock = await createProduct(cookie, 'Control de Stock', '20.00', 'USD');

    const res = await request(t.app)
      .post(`/api/clients/${clientId}/products`)
      .set('Cookie', cookie)
      .send({ productIds: [turnos, stock] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ client: { id: clientId, status: 'inactivo' } });
    expect(productNamesOf(res.body)).toEqual(['Control de Stock', 'Sistema de Turnos']);
    expect(res.body).toMatchObject({
      client: { products: [{ id: stock, price: '20.00', currency: 'USD' }, { id: turnos, price: '15000.50' }] },
    });

    const detail = await request(t.app).get(`/api/clients/${clientId}`).set('Cookie', cookie);
    expect(detail.body).toEqual(res.body);
    expect(assignmentRows()).toHaveLength(2);
  });

  // AC-14: asignar uno ya asignado → 409 y queda una sola asignación
  it('test_http_asignar_ya_asignado_conflict', async () => {
    const cookie = await sessionAs('editor');
    const clientId = await createClient(cookie, LOS_ANDES);
    const turnos = await createProduct(cookie, 'Sistema de Turnos');
    const stock = await createProduct(cookie, 'Control de Stock');
    const first = await request(t.app)
      .post(`/api/clients/${clientId}/products`)
      .set('Cookie', cookie)
      .send({ productIds: [turnos] });
    expect(first.status).toBe(200);

    const again = await request(t.app)
      .post(`/api/clients/${clientId}/products`)
      .set('Cookie', cookie)
      .send({ productIds: [stock, turnos] });

    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'El producto ya está asignado a ese cliente' });
    // Todo o nada: tampoco se asignó `stock`.
    expect(assignmentRows()).toEqual([{ client_id: clientId, product_id: turnos }]);

    // Cliente o producto inexistente → 404.
    const noClient = await request(t.app)
      .post('/api/clients/no-existe/products')
      .set('Cookie', cookie)
      .send({ productIds: [stock] });
    expect(noClient.status).toBe(404);
    const noProduct = await request(t.app)
      .post(`/api/clients/${clientId}/products`)
      .set('Cookie', cookie)
      .send({ productIds: ['no-existe'] });
    expect(noProduct.status).toBe(404);
    expect(assignmentRows()).toHaveLength(1);
  });

  // productIds: lista de 1 a 50 strings de hasta 64 caracteres, sin repetidos; si no, 400
  it('test_http_asignar_lista_invalida_rechazada', async () => {
    const cookie = await sessionAs('admin');
    const clientId = await createClient(cookie, LOS_ANDES);
    const turnos = await createProduct(cookie, 'Sistema de Turnos');

    const invalid: unknown[] = [
      [],
      [turnos, turnos],
      Array.from({ length: 51 }, (_, i) => `p-${String(i)}`),
      [turnos, 7],
      ['x'.repeat(65)],
      turnos,
      null,
    ];
    for (const productIds of invalid) {
      const res = await request(t.app)
        .post(`/api/clients/${clientId}/products`)
        .set('Cookie', cookie)
        .send({ productIds });
      expect(res.status, JSON.stringify(productIds).slice(0, 40)).toBe(400);
      expect(responseBody(res.body, { error: 'string' }).error).toContain('productIds');
    }
    const missing = await request(t.app).post(`/api/clients/${clientId}/products`).set('Cookie', cookie).send({});
    expect(missing.status).toBe(400);

    expect(assignmentRows()).toEqual([]);
  });

  // AC-15: desasignar responde 204 y el detalle muestra solo el otro producto
  it('test_http_desasignar_producto', async () => {
    const cookie = await sessionAs('editor');
    const clientId = await createClient(cookie, LOS_ANDES);
    const turnos = await createProduct(cookie, 'Sistema de Turnos');
    const stock = await createProduct(cookie, 'Control de Stock');
    await request(t.app)
      .post(`/api/clients/${clientId}/products`)
      .set('Cookie', cookie)
      .send({ productIds: [turnos, stock] });

    const res = await request(t.app)
      .post(`/api/clients/${clientId}/products/${turnos}/unassign`)
      .set('Cookie', cookie)
      .send({});

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const detail = await request(t.app).get(`/api/clients/${clientId}`).set('Cookie', cookie);
    expect(productNamesOf(detail.body)).toEqual(['Control de Stock']);
    expect(assignmentRows()).toEqual([{ client_id: clientId, product_id: stock }]);
  });

  // Desasignar uno no asignado → 404 y nada cambia
  it('test_http_desasignar_no_asignado_no_encontrado', async () => {
    const cookie = await sessionAs('editor');
    const clientId = await createClient(cookie, LOS_ANDES);
    const turnos = await createProduct(cookie, 'Sistema de Turnos');
    const stock = await createProduct(cookie, 'Control de Stock');
    await request(t.app)
      .post(`/api/clients/${clientId}/products`)
      .set('Cookie', cookie)
      .send({ productIds: [stock] });

    const res = await request(t.app)
      .post(`/api/clients/${clientId}/products/${turnos}/unassign`)
      .set('Cookie', cookie)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'El producto no está asignado a ese cliente' });
    const noClient = await request(t.app)
      .post(`/api/clients/no-existe/products/${stock}/unassign`)
      .set('Cookie', cookie)
      .send({});
    expect(noClient.status).toBe(404);
    expect(noClient.body).toEqual({ error: 'El cliente no existe' });
    expect(assignmentRows()).toEqual([{ client_id: clientId, product_id: stock }]);
  });
});

describe('autorización, concurrencia y volumen', () => {
  // AC-16: Consulta recibe 403 en cada escritura (con bodies válidos) y 200 en listados y detalle
  it('test_http_consulta_forbidden_en_escrituras', async () => {
    const editor = await sessionAs('editor');
    const clientId = await createClient(editor, LOS_ANDES);
    const turnos = await createProduct(editor, 'Sistema de Turnos');
    const stock = await createProduct(editor, 'Control de Stock');
    await request(t.app)
      .post(`/api/clients/${clientId}/products`)
      .set('Cookie', editor)
      .send({ productIds: [turnos] });
    await request(t.app).post(`/api/products/${stock}/deactivate`).set('Cookie', editor).send({});
    const snapshot = () => ({
      clients: clientRows(),
      assignments: assignmentRows(),
      products: t.db.$client.prepare('SELECT * FROM products ORDER BY id').all(),
    });
    const before = snapshot();

    const consulta = await sessionAs('consulta');
    const writes: Array<[string, () => request.Test]> = [
      ['POST /clients', () => request(t.app).post('/api/clients').set('Cookie', consulta).send(DEL_SUR)],
      [
        'PATCH /clients/:id',
        () => request(t.app).patch(`/api/clients/${clientId}`).set('Cookie', consulta).send({ address: 'Otra 1' }),
      ],
      [
        'POST /clients/:id/deactivate',
        () => request(t.app).post(`/api/clients/${clientId}/deactivate`).set('Cookie', consulta).send({}),
      ],
      [
        'POST /clients/:id/reactivate',
        () => request(t.app).post(`/api/clients/${clientId}/reactivate`).set('Cookie', consulta).send({}),
      ],
      [
        'POST /clients/:id/products',
        () =>
          request(t.app)
            .post(`/api/clients/${clientId}/products`)
            .set('Cookie', consulta)
            .send({ productIds: [stock] }),
      ],
      [
        'POST /clients/:id/products/:productId/unassign',
        () =>
          request(t.app).post(`/api/clients/${clientId}/products/${turnos}/unassign`).set('Cookie', consulta).send({}),
      ],
      [
        'POST /products',
        () =>
          request(t.app)
            .post('/api/products')
            .set('Cookie', consulta)
            .send({ name: 'Nuevo', price: '1.00', currency: 'ARS' }),
      ],
      [
        'PATCH /products/:id',
        () => request(t.app).patch(`/api/products/${turnos}`).set('Cookie', consulta).send({ price: '1.00' }),
      ],
      [
        'POST /products/:id/deactivate',
        () => request(t.app).post(`/api/products/${turnos}/deactivate`).set('Cookie', consulta).send({}),
      ],
      [
        'POST /products/:id/reactivate',
        () => request(t.app).post(`/api/products/${stock}/reactivate`).set('Cookie', consulta).send({}),
      ],
    ];
    for (const [label, send] of writes) {
      const res = await send();
      expect(res.status, label).toBe(403);
      expect(Object.keys(res.body as object)).toEqual(['error']);
    }
    expect(snapshot()).toEqual(before);

    const reads: Array<[string, request.Response]> = [
      ['GET /clients', await request(t.app).get('/api/clients').set('Cookie', consulta)],
      ['GET /clients/:id', await request(t.app).get(`/api/clients/${clientId}`).set('Cookie', consulta)],
      ['GET /products', await request(t.app).get('/api/products').set('Cookie', consulta)],
    ];
    for (const [label, res] of reads) expect(res.status, label).toBe(200);
    expect(productNamesOf(reads[1]?.[1].body)).toEqual(['Sistema de Turnos']);

    // Sin sesión: 401 (no son rutas públicas).
    const anonymous = await request(t.app).get('/api/clients');
    expect(anonymous.status).toBe(401);
    const anonymousProducts = await request(t.app).get('/api/products');
    expect(anonymousProducts.status).toBe(401);
  });

  // AC-17: dos altas simultáneas con el mismo CUIT → un 201, un 409 y un solo registro
  it('test_http_altas_simultaneas_mismo_cuit', async () => {
    const cookie = await sessionAs('editor');

    // Los dos POST salen a la vez, pero el event loop los serializa: los handlers y better-sqlite3
    // son síncronos, así que cada alta corre entera antes que la otra y el 409 lo da el control
    // previo dentro de la transacción. La barrera del UNIQUE de la base la cubren
    // `test_race_dos_altas_mismo_cuit_conflict` (Block 3) y `test_client_repo_cuit_duplicado_rechazado`
    // (Block 2). Este test fija el contrato HTTP: un 201, un 409 y un solo registro.
    const responses = await Promise.all([
      request(t.app).post('/api/clients').set('Cookie', cookie).send(LOS_ANDES),
      request(t.app)
        .post('/api/clients')
        .set('Cookie', cookie)
        .send({ ...LOS_ANDES, businessName: 'Los Andes (copia)', billingEmail: 'otro@losandes.com' }),
    ]);

    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const conflict = responses.find((res) => res.status === 409);
    expect(conflict?.body).toEqual({ error: 'Ya existe un cliente con ese CUIT' });
    expect(clientRows().map((row) => row.cuit)).toEqual([CUITS.losAndes]);
  });

  // NFR-02: los listados con 1000 clientes y 1000 productos responden en menos de 500 ms
  it('test_http_listados_1000_registros_rapidos', async () => {
    const cookie = await sessionAs('consulta');
    seedCatalog(1000);

    // Un GET de calentamiento por listado (JIT, caché de sentencias) y después la mediana de 5
    // corridas: el límite mide el listado, no un pico del runner.
    const clients = await request(t.app).get('/api/clients').set('Cookie', cookie);
    const products = await request(t.app).get('/api/products').set('Cookie', cookie);
    expect(clients.status).toBe(200);
    expect(products.status).toBe(200);
    expect(responseBody(clients.body, { clients: 'unknown' }).clients).toHaveLength(1000);
    expect(responseBody(products.body, { products: 'unknown' }).products).toHaveLength(1000);

    const clientsMs = await medianMs(5, '/api/clients', cookie);
    const productsMs = await medianMs(5, '/api/products', cookie);

    expect(clientsMs).toBeLessThan(500);
    expect(productsMs).toBeLessThan(500);
  });
});

/** Mediana, en ms, de `runs` GET a `path` (cada uno con 200 y medido de punta a punta). */
async function medianMs(runs: number, path: string, cookie: string): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const res = await request(t.app).get(path).set('Cookie', cookie);
    times.push(performance.now() - start);
    expect(res.status).toBe(200);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] as number;
}

/** Siembra clientes y productos directo por los repositorios, en una sola transacción. */
function seedCatalog(count: number): void {
  const clients = new DrizzleClientRepository(t.db);
  const products = new DrizzleProductRepository(t.db);
  const cuits = cuitsFor(count);
  const now = t.clock.now();
  t.db.$client.transaction(() => {
    for (let i = 0; i < count; i++) {
      const suffix = String(i).padStart(4, '0');
      clients.insert(
        Client.create({
          id: `c-${suffix}`,
          businessName: `Cliente ${suffix}`,
          cuit: Cuit.parse(cuits[i] as string),
          address: `Calle ${suffix}`,
          billingEmail: Email.create(`cliente${suffix}@empresa.com`),
          ivaCondition: IvaCondition.of(1),
          createdAt: now,
        }),
      );
      products.insert(
        Product.create({
          id: `p-${suffix}`,
          name: `Producto ${suffix}`,
          price: Price.parse(`${String(i + 1)}.50`, i % 2 === 0 ? 'ARS' : 'USD'),
          createdAt: now,
        }),
      );
    }
  })();
}
