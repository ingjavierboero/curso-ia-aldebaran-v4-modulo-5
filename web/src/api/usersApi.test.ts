import { describe, expect, it } from 'vitest';
import { ANA, EVA, mockFetch } from '../test/fetchMock';
import { NetworkError } from './client';
import { createUser, deactivateUser, listUsers, reactivateUser, updateUser } from './usersApi';

describe('usersApi', () => {
  it('llama a las rutas del contrato con su método y body y devuelve los usuarios', async () => {
    const fetchMock = mockFetch({
      'GET /api/users': { status: 200, body: { users: [ANA, EVA] } },
      'POST /api/users': { status: 201, body: { user: EVA } },
      'PATCH /api/users/u-2': { status: 200, body: { user: { ...EVA, role: 'consulta' } } },
      'POST /api/users/u-2/deactivate': { status: 200, body: { user: { ...EVA, status: 'inactivo' } } },
      'POST /api/users/u-2/reactivate': { status: 200, body: { user: EVA } },
    });

    await expect(listUsers()).resolves.toEqual([ANA, EVA]);
    await expect(
      createUser({ name: 'Eva Editora', email: 'eva@aldebaran.test', role: 'editor', password: 'secreta12' }),
    ).resolves.toEqual(EVA);
    await expect(updateUser('u-2', { role: 'consulta' })).resolves.toEqual({ ...EVA, role: 'consulta' });
    await expect(deactivateUser('u-2')).resolves.toEqual({ ...EVA, status: 'inactivo' });
    await expect(reactivateUser('u-2')).resolves.toEqual(EVA);

    expect(fetchMock.callsTo('POST', '/api/users')[0]?.body).toEqual({
      name: 'Eva Editora',
      email: 'eva@aldebaran.test',
      role: 'editor',
      password: 'secreta12',
    });
    expect(fetchMock.callsTo('PATCH', '/api/users/u-2')[0]?.body).toEqual({ role: 'consulta' });
    expect(fetchMock.callsTo('POST', '/api/users/u-2/deactivate')[0]?.body).toEqual({});
    expect(fetchMock.callsTo('POST', '/api/users/u-2/reactivate')[0]?.body).toEqual({});
  });

  // Una respuesta 2xx con forma inválida es, para la UI, lo mismo que no tener servidor.
  it('test_users_api_respuesta_invalida_es_network_error', async () => {
    mockFetch({
      'GET /api/users': [
        { status: 200, body: { users: [{ ...ANA, role: 'superadmin' }] } },
        { status: 200, body: { users: 'todos' } },
        { status: 200, body: { users: [{ ...ANA, status: 'borrado' }] } },
        { status: 200, body: [ANA] },
      ],
      'POST /api/users': { status: 201, body: { user: { id: 1, name: 'Eva' } } },
      'PATCH /api/users/u-2': { status: 200, body: { user: { ...EVA, email: null } } },
      'POST /api/users/u-2/deactivate': { status: 200, body: {} },
      'POST /api/users/u-2/reactivate': { status: 200, body: { user: { ...EVA, name: 7 } } },
    });

    for (let i = 0; i < 4; i++) {
      await expect(listUsers()).rejects.toBeInstanceOf(NetworkError);
    }
    await expect(
      createUser({ name: 'Eva', email: 'eva@aldebaran.test', role: 'editor', password: 'secreta12' }),
    ).rejects.toBeInstanceOf(NetworkError);
    await expect(updateUser('u-2', { name: 'Eva' })).rejects.toBeInstanceOf(NetworkError);
    await expect(deactivateUser('u-2')).rejects.toBeInstanceOf(NetworkError);
    await expect(reactivateUser('u-2')).rejects.toBeInstanceOf(NetworkError);
  });
});
