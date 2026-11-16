import { describe, expect, it } from 'vitest';
import { STOCK, TURNOS } from '../test/catalogFixtures';
import { mockFetch } from '../test/fetchMock';
import { NetworkError } from './client';
import { createProduct, deactivateProduct, listProducts, reactivateProduct, updateProduct } from './productsApi';

describe('productsApi', () => {
  it('llama a las rutas del contrato con su método y body y devuelve los productos', async () => {
    const fetchMock = mockFetch({
      'GET /api/products': { status: 200, body: { products: [STOCK, TURNOS] } },
      'POST /api/products': { status: 201, body: { product: TURNOS } },
      'PATCH /api/products/p-1': { status: 200, body: { product: { ...TURNOS, currency: 'USD' } } },
      'POST /api/products/p-1/deactivate': { status: 200, body: { product: { ...TURNOS, status: 'inactivo' } } },
      'POST /api/products/p-1/reactivate': { status: 200, body: { product: TURNOS } },
    });

    await expect(listProducts()).resolves.toEqual([STOCK, TURNOS]);
    await expect(createProduct({ name: 'Sistema de Turnos', price: '15000.50', currency: 'ARS' })).resolves.toEqual(TURNOS);
    await expect(updateProduct('p-1', { currency: 'USD' })).resolves.toEqual({ ...TURNOS, currency: 'USD' });
    await expect(deactivateProduct('p-1')).resolves.toEqual({ ...TURNOS, status: 'inactivo' });
    await expect(reactivateProduct('p-1')).resolves.toEqual(TURNOS);

    // El precio viaja como texto, nunca como número (NFR-03).
    expect(fetchMock.callsTo('POST', '/api/products')[0]?.body).toEqual({
      name: 'Sistema de Turnos',
      price: '15000.50',
      currency: 'ARS',
    });
    expect(fetchMock.callsTo('PATCH', '/api/products/p-1')[0]?.body).toEqual({ currency: 'USD' });
    expect(fetchMock.callsTo('POST', '/api/products/p-1/deactivate')[0]?.body).toEqual({});
    expect(fetchMock.callsTo('POST', '/api/products/p-1/reactivate')[0]?.body).toEqual({});
  });

  it('una respuesta 2xx con forma inválida es NetworkError', async () => {
    mockFetch({
      'GET /api/products': [
        { status: 200, body: { products: [{ ...TURNOS, price: 15000.5 }] } },
        { status: 200, body: { products: [{ ...TURNOS, price: '1e3' }] } },
        { status: 200, body: { products: [{ ...TURNOS, currency: 'EUR' }] } },
        { status: 200, body: { products: null } },
      ],
      'POST /api/products': { status: 201, body: { product: { ...TURNOS, status: 'borrado' } } },
      'PATCH /api/products/p-1': { status: 200, body: { product: { ...TURNOS, name: 3 } } },
      'POST /api/products/p-1/deactivate': { status: 200, body: {} },
      'POST /api/products/p-1/reactivate': { status: 200, body: { product: [TURNOS] } },
    });

    for (let i = 0; i < 4; i++) {
      await expect(listProducts()).rejects.toBeInstanceOf(NetworkError);
    }
    await expect(createProduct({ name: 'X', price: '1.00', currency: 'ARS' })).rejects.toBeInstanceOf(NetworkError);
    await expect(updateProduct('p-1', { name: 'X' })).rejects.toBeInstanceOf(NetworkError);
    await expect(deactivateProduct('p-1')).rejects.toBeInstanceOf(NetworkError);
    await expect(reactivateProduct('p-1')).rejects.toBeInstanceOf(NetworkError);
  });
});
