import { describe, expect, it } from 'vitest';
import { BETA, LOS_ANDES, STOCK, TURNOS } from '../test/catalogFixtures';
import { mockFetch } from '../test/fetchMock';
import {
  assignProducts,
  createClient,
  deactivateClient,
  getClient,
  listClients,
  reactivateClient,
  unassignProduct,
  updateClient,
} from './clientsApi';
import { NetworkError } from './client';

const INPUT = {
  businessName: 'Los Andes SA',
  cuit: '30711111111',
  address: 'Av. Siempreviva 742',
  billingEmail: 'pagos@losandes.com',
  ivaCondition: 1,
};

describe('clientsApi', () => {
  it('llama a las rutas del contrato con su método y body y devuelve los clientes', async () => {
    const DETAIL = { ...LOS_ANDES, products: [STOCK, TURNOS] };
    const fetchMock = mockFetch({
      'GET /api/clients': { status: 200, body: { clients: [LOS_ANDES, BETA] } },
      'GET /api/clients/c-1': { status: 200, body: { client: DETAIL } },
      'POST /api/clients': { status: 201, body: { client: LOS_ANDES } },
      'PATCH /api/clients/c-1': { status: 200, body: { client: { ...LOS_ANDES, address: 'Otra 1' } } },
      'POST /api/clients/c-1/deactivate': { status: 200, body: { client: { ...LOS_ANDES, status: 'inactivo' } } },
      'POST /api/clients/c-1/reactivate': { status: 200, body: { client: LOS_ANDES } },
      'POST /api/clients/c-1/products': { status: 200, body: { client: DETAIL } },
      'POST /api/clients/c-1/products/p-1/unassign': { status: 204 },
    });

    await expect(listClients()).resolves.toEqual([LOS_ANDES, BETA]);
    await expect(getClient('c-1')).resolves.toEqual(DETAIL);
    await expect(createClient(INPUT)).resolves.toEqual(LOS_ANDES);
    await expect(updateClient('c-1', { address: 'Otra 1' })).resolves.toEqual({ ...LOS_ANDES, address: 'Otra 1' });
    await expect(deactivateClient('c-1')).resolves.toEqual({ ...LOS_ANDES, status: 'inactivo' });
    await expect(reactivateClient('c-1')).resolves.toEqual(LOS_ANDES);
    await expect(assignProducts('c-1', ['p-1', 'p-2'])).resolves.toEqual(DETAIL);
    await expect(unassignProduct('c-1', 'p-1')).resolves.toBeUndefined();

    expect(fetchMock.callsTo('POST', '/api/clients')[0]?.body).toEqual(INPUT);
    expect(fetchMock.callsTo('PATCH', '/api/clients/c-1')[0]?.body).toEqual({ address: 'Otra 1' });
    expect(fetchMock.callsTo('POST', '/api/clients/c-1/deactivate')[0]?.body).toEqual({});
    expect(fetchMock.callsTo('POST', '/api/clients/c-1/reactivate')[0]?.body).toEqual({});
    expect(fetchMock.callsTo('POST', '/api/clients/c-1/products')[0]?.body).toEqual({ productIds: ['p-1', 'p-2'] });
    expect(fetchMock.callsTo('POST', '/api/clients/c-1/products/p-1/unassign')[0]?.body).toEqual({});
  });

  it('una respuesta 2xx con forma inválida es NetworkError', async () => {
    mockFetch({
      'GET /api/clients': [
        { status: 200, body: { clients: [{ ...LOS_ANDES, ivaCondition: 1 }] } },
        { status: 200, body: { clients: [{ ...LOS_ANDES, ivaCondition: { code: 2, name: 'X' } }] } },
        { status: 200, body: { clients: [{ ...LOS_ANDES, status: 'borrado' }] } },
        { status: 200, body: { clients: 'todos' } },
        { status: 200, body: [LOS_ANDES] },
      ],
      'GET /api/clients/c-1': [
        { status: 200, body: { client: LOS_ANDES } },
        { status: 200, body: { client: { ...LOS_ANDES, products: [{ ...TURNOS, price: 15000.5 }] } } },
      ],
      'POST /api/clients': { status: 201, body: { client: { ...LOS_ANDES, cuit: 30711111111 } } },
      'PATCH /api/clients/c-1': { status: 200, body: {} },
      'POST /api/clients/c-1/deactivate': { status: 200, body: { client: { ...LOS_ANDES, businessName: null } } },
      'POST /api/clients/c-1/reactivate': { status: 200, body: { client: { ...LOS_ANDES, id: 1 } } },
      'POST /api/clients/c-1/products': { status: 200, body: { client: LOS_ANDES } },
    });

    for (let i = 0; i < 5; i++) {
      await expect(listClients()).rejects.toBeInstanceOf(NetworkError);
    }
    await expect(getClient('c-1')).rejects.toBeInstanceOf(NetworkError);
    await expect(getClient('c-1')).rejects.toBeInstanceOf(NetworkError);
    await expect(createClient(INPUT)).rejects.toBeInstanceOf(NetworkError);
    await expect(updateClient('c-1', { address: 'x' })).rejects.toBeInstanceOf(NetworkError);
    await expect(deactivateClient('c-1')).rejects.toBeInstanceOf(NetworkError);
    await expect(reactivateClient('c-1')).rejects.toBeInstanceOf(NetworkError);
    await expect(assignProducts('c-1', ['p-1'])).rejects.toBeInstanceOf(NetworkError);
  });
});
