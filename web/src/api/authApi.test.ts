import { describe, expect, it } from 'vitest';
import { mockFetch } from '../test/fetchMock';
import { NETWORK_ERROR_MESSAGE, NetworkError, getSession } from './authApi';

describe('authApi', () => {
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
