import { describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { mockFetch } from '../test/fetchMock';
import * as authApi from './authApi';
import {
  ApiError,
  NETWORK_ERROR_MESSAGE,
  NetworkError,
  changePassword,
  checkResetToken,
  confirmPasswordReset,
  getSession,
  requestPasswordReset,
  setUnauthorizedHandler,
} from './authApi';
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

  // changePassword hace POST /api/auth/password con los dos campos y resuelve con el 204 (AC-03).
  it('test_auth_api_change_password_envia_post', async () => {
    const fetchMock = mockFetch({ 'POST /api/auth/password': { status: 204 } });

    await expect(changePassword({ currentPassword: 'vieja-123', newPassword: 'nueva-456' })).resolves.toBeUndefined();

    const calls = fetchMock.callsTo('POST', '/api/auth/password');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ currentPassword: 'vieja-123', newPassword: 'nueva-456' });
    expect(calls[0]?.init?.credentials).toBe('include');
    expect(new Headers(calls[0]?.init?.headers).get('Content-Type')).toBe('application/json');
  });

  // Las tres llamadas de la recuperación de contraseña (FEAT-008): método, ruta y body correctos.
  it('test_auth_api_funciones_de_recuperacion', async () => {
    const token = 'A'.repeat(43);
    const message = 'Si el email corresponde a un usuario activo, te enviamos un enlace.';
    const fetchMock = mockFetch({
      'POST /api/auth/password-reset': { status: 200, body: { message } },
      'POST /api/auth/password-reset/check': { status: 204 },
      'POST /api/auth/password-reset/confirm': { status: 204 },
    });

    await expect(requestPasswordReset('ana@aldebaran.test')).resolves.toEqual({ message });
    await expect(checkResetToken(token)).resolves.toBeUndefined();
    await expect(confirmPasswordReset(token, 'nueva-segura')).resolves.toBeUndefined();

    expect(fetchMock.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/auth/password-reset',
      'POST /api/auth/password-reset/check',
      'POST /api/auth/password-reset/confirm',
    ]);
    expect(fetchMock.calls.map((c) => c.body)).toEqual([
      { email: 'ana@aldebaran.test' },
      { token },
      { token, newPassword: 'nueva-segura' },
    ]);
    for (const call of fetchMock.calls) {
      expect(new Headers(call.init?.headers).get('Content-Type')).toBe('application/json');
    }
  });

  // Un 401 inesperado en las rutas públicas no navega ni toca el store: no hay sesión que perder.
  it('las llamadas de recuperación no disparan el manejo de 401', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    useAuthStore.setState({ user: null, status: 'loading' });
    mockFetch({
      'POST /api/auth/password-reset': { status: 401, body: { error: 'x' } },
      'POST /api/auth/password-reset/check': { status: 401, body: { error: 'x' } },
      'POST /api/auth/password-reset/confirm': { status: 401, body: { error: 'x' } },
    });

    await expect(requestPasswordReset('ana@aldebaran.test')).rejects.toBeInstanceOf(ApiError);
    await expect(checkResetToken('t')).rejects.toBeInstanceOf(ApiError);
    await expect(confirmPasswordReset('t', 'nueva-segura')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('loading');
  });
});
