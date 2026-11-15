import { describe, expect, it } from 'vitest';
import { mockFetch } from '../test/fetchMock';
import * as authApi from './authApi';
import { NETWORK_ERROR_MESSAGE, NetworkError, getSession } from './authApi';
import * as client from './client';

describe('authApi', () => {
  // `authApi` sigue exportando lo de siempre, que ahora vive en `client.ts` (los mismos objetos).
  it('reexporta los errores, el handler de 401 y errorText del cliente', () => {
    expect(authApi.ApiError).toBe(client.ApiError);
    expect(authApi.NetworkError).toBe(client.NetworkError);
    expect(authApi.setUnauthorizedHandler).toBe(client.setUnauthorizedHandler);
    expect(authApi.errorText).toBe(client.errorText);
    expect(authApi.NETWORK_ERROR_MESSAGE).toBe(client.NETWORK_ERROR_MESSAGE);
  });

  it('test_network_error_5xx_lleva_status', async () => {
    mockFetch({ 'GET /api/auth/session': [{ status: 503, body: { error: 'caído' } }, 'network-error'] });

    // 5xx: el error lleva el status, con el mismo mensaje y nombre de siempre.
    const serverError = await getSession().catch((err: unknown) => err);
    expect(serverError).toBeInstanceOf(NetworkError);
    expect((serverError as NetworkError).status).toBe(503);
    expect((serverError as NetworkError).message).toBe(NETWORK_ERROR_MESSAGE);
    expect((serverError as NetworkError).name).toBe('NetworkError');

    // Sin respuesta (fetch rechazado): status null.
    const networkError = await getSession().catch((err: unknown) => err);
    expect(networkError).toBeInstanceOf(NetworkError);
    expect((networkError as NetworkError).status).toBeNull();
    expect((networkError as NetworkError).message).toBe(NETWORK_ERROR_MESSAGE);

    // Constructor por defecto.
    expect(new NetworkError().status).toBeNull();
  });
});
