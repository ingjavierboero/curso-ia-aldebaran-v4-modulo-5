import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UserRole } from '../../../src/domain/user/User.js';
import { CUITS } from '../../support/catalogContext.js';
import { sessionAs as sessionOf } from '../../support/httpSession.js';
import { responseBody } from '../../support/responseBody.js';
import { type TestApp, createTestApp } from '../../support/testApp.js';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(() => {
  t.cleanup();
});

const sessionAs = (role: UserRole): Promise<string> => sessionOf(t, role);

interface ProductRow {
  id: string;
  name: string;
  name_normalized: string;
  price_cents: number;
  currency: string;
  status: string;
}

function productRows(): ProductRow[] {
  return t.db.$client
    .prepare('SELECT id, name, name_normalized, price_cents, currency, status FROM products ORDER BY id')
    .all() as ProductRow[];
}

async function createProduct(cookie: string, body: object): Promise<string> {
  const res = await request(t.app).post('/api/products').set('Cookie', cookie).send(body);
  expect(res.status).toBe(201);
  return responseBody(res.body, { product: { id: 'string' } }).product.id;
}

async function createClient(cookie: string, cuit: string, billingEmail: string): Promise<string> {
  const res = await request(t.app)
    .post('/api/clients')
    .set('Cookie', cookie)
    .send({ businessName: `Cliente ${cuit}`, cuit, address: 'Calle 1', billingEmail, ivaCondition: 5 });
  expect(res.status).toBe(201);
  return responseBody(res.body, { client: { id: 'string' } }).client.id;
}

const TURNOS = { name: 'Sistema de Turnos', price: '15000.50', currency: 'ARS' } as const;

describe('productos por HTTP', () => {
  // AC-08: el precio viaja como texto y vuelve igual, sin pérdida
  it('test_http_alta_producto_precio_texto', async () => {
    const cookie = await sessionAs('editor');

    const created = await request(t.app).post('/api/products').set('Cookie', cookie).send(TURNOS);

    expect(created.status).toBe(201);
    const { product } = responseBody(created.body, { product: { id: 'string' } });
    expect(created.body).toEqual({
      product: {
        id: product.id,
        name: 'Sistema de Turnos',
        price: '15000.50',
        currency: 'ARS',
        status: 'activo',
        createdAt: t.clock.now().toISOString(),
      },
    });
    expect(productRows()).toMatchObject([{ id: product.id, price_cents: 1_500_050, currency: 'ARS' }]);

    const list = await request(t.app).get('/api/products').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ products: [product] });
    // Ningún número en el JSON del precio.
    expect(list.text).toContain('"price":"15000.50"');

    // Sin campos → 400.
    for (const field of ['name', 'price', 'currency']) {
      const body: Record<string, unknown> = { ...TURNOS, name: 'Otro' };
      delete body[field];
      const res = await request(t.app).post('/api/products').set('Cookie', cookie).send(body);
      expect(res.status, `sin ${field}`).toBe(400);
    }
    // Moneda inválida → 400.
    const eur = await request(t.app)
      .post('/api/products')
      .set('Cookie', cookie)
      .send({ ...TURNOS, name: 'Otro', currency: 'EUR' });
    expect(eur.status).toBe(400);
    expect(eur.body).toEqual({ error: 'La moneda debe ser ARS o USD' });
    // Nombre de 101 caracteres → 400.
    const long = await request(t.app)
      .post('/api/products')
      .set('Cookie', cookie)
      .send({ ...TURNOS, name: 'x'.repeat(101) });
    expect(long.status).toBe(400);
    expect(productRows()).toHaveLength(1);
  });

  // AC-09: "0", "-100" y 15000.5 como número → 400; "0.01" → 201
  it('test_http_precio_invalido_rechazado', async () => {
    const cookie = await sessionAs('admin');

    for (const price of ['0', '-100', 15000.5, '1.234', '1e3', '9999999999']) {
      const res = await request(t.app)
        .post('/api/products')
        .set('Cookie', cookie)
        .send({ ...TURNOS, price });
      expect(res.status, `alta con ${JSON.stringify(price)}`).toBe(400);
      expect(responseBody(res.body, { error: 'string' }).error).not.toBe('');
    }
    expect(productRows()).toEqual([]);

    const cent = await request(t.app)
      .post('/api/products')
      .set('Cookie', cookie)
      .send({ ...TURNOS, price: '0.01' });
    expect(cent.status).toBe(201);
    expect(cent.body).toMatchObject({ product: { price: '0.01' } });
    const id = responseBody(cent.body, { product: { id: 'string' } }).product.id;

    const before = productRows();
    for (const price of ['0', '-100', 15000.5]) {
      const res = await request(t.app).patch(`/api/products/${id}`).set('Cookie', cookie).send({ price });
      expect(res.status, `modificación con ${JSON.stringify(price)}`).toBe(400);
    }
    expect(productRows()).toEqual(before);
  });

  // AC-10: un producto en pesos pasa a dólares con otro precio
  it('test_http_modificar_producto_a_dolares', async () => {
    const cookie = await sessionAs('editor');
    const id = await createProduct(cookie, TURNOS);

    const res = await request(t.app)
      .patch(`/api/products/${id}`)
      .set('Cookie', cookie)
      .send({ name: 'Turnos Pro', price: '25.5', currency: 'USD' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ product: { id, name: 'Turnos Pro', price: '25.50', currency: 'USD' } });
    expect(productRows()).toMatchObject([{ id, name: 'Turnos Pro', price_cents: 2550, currency: 'USD' }]);

    const list = await request(t.app).get('/api/products').set('Cookie', cookie);
    expect(list.body).toEqual({ products: [responseBody(res.body, { product: 'object' }).product] });

    // Solo la moneda: el precio se conserva.
    const onlyCurrency = await request(t.app).patch(`/api/products/${id}`).set('Cookie', cookie).send({ currency: 'ARS' });
    expect(onlyCurrency.status).toBe(200);
    expect(onlyCurrency.body).toMatchObject({ product: { price: '25.50', currency: 'ARS' } });

    // Sin campos reconocidos → 400; inexistente → 404.
    const empty = await request(t.app).patch(`/api/products/${id}`).set('Cookie', cookie).send({});
    expect(empty.status).toBe(400);
    const missing = await request(t.app).patch('/api/products/no-existe').set('Cookie', cookie).send({ name: 'X' });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'El producto no existe' });
  });

  // AC-11: el nombre no se repite sin distinguir mayúsculas → 409, en alta y modificación
  it('test_http_nombre_producto_duplicado_conflict', async () => {
    const cookie = await sessionAs('editor');
    await createProduct(cookie, TURNOS);
    const stockId = await createProduct(cookie, { name: 'Control de Stock', price: '10.00', currency: 'USD' });
    const before = productRows();

    const created = await request(t.app)
      .post('/api/products')
      .set('Cookie', cookie)
      .send({ ...TURNOS, name: '  sistema de turnos ' });
    expect(created.status).toBe(409);
    expect(created.body).toEqual({ error: 'Ya existe un producto con ese nombre' });

    const renamed = await request(t.app)
      .patch(`/api/products/${stockId}`)
      .set('Cookie', cookie)
      .send({ name: 'SISTEMA DE TURNOS' });
    expect(renamed.status).toBe(409);

    expect(productRows()).toEqual(before);
  });

  // AC-12: un producto desactivado sigue en el detalle del cliente, no se asigna a otro (409) y
  // reactivado se puede asignar
  it('test_http_desactivar_producto_asignado', async () => {
    const cookie = await sessionAs('admin');
    const productId = await createProduct(cookie, TURNOS);
    const losAndes = await createClient(cookie, CUITS.losAndes, 'pagos@losandes.com');
    const delSur = await createClient(cookie, CUITS.delSur, 'admin@delsur.com');
    const assigned = await request(t.app)
      .post(`/api/clients/${losAndes}/products`)
      .set('Cookie', cookie)
      .send({ productIds: [productId] });
    expect(assigned.status).toBe(200);

    const off = await request(t.app).post(`/api/products/${productId}/deactivate`).set('Cookie', cookie).send({});
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ product: { id: productId, status: 'inactivo' } });

    const detail = await request(t.app).get(`/api/clients/${losAndes}`).set('Cookie', cookie);
    expect(detail.body).toMatchObject({ client: { products: [{ id: productId, status: 'inactivo' }] } });

    const toOther = await request(t.app)
      .post(`/api/clients/${delSur}/products`)
      .set('Cookie', cookie)
      .send({ productIds: [productId] });
    expect(toOther.status).toBe(409);
    expect(toOther.body).toEqual({ error: 'El producto está Inactivo y no se puede asignar' });

    const on = await request(t.app).post(`/api/products/${productId}/reactivate`).set('Cookie', cookie).send({});
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ product: { id: productId, status: 'activo' } });
    const retry = await request(t.app)
      .post(`/api/clients/${delSur}/products`)
      .set('Cookie', cookie)
      .send({ productIds: [productId] });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ client: { id: delSur, products: [{ id: productId, status: 'activo' }] } });

    const missing = await request(t.app).post('/api/products/no-existe/reactivate').set('Cookie', cookie).send({});
    expect(missing.status).toBe(404);
  });
});
