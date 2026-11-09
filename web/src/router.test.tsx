import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from './store/authStore';
import { SESSION_401, mockFetch } from './test/fetchMock';
import { renderApp } from './test/renderApp';

describe('router', () => {
  it('/ sin sesión es rechazado y redirige a /login', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
    });
    const { router } = renderApp('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anon');
    expect(fetchMock.callsTo('GET', '/api/auth/session')[0]?.init?.credentials).toBe('include');
  });
});
