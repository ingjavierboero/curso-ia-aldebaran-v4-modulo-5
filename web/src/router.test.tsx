import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from './store/authStore';
import { ANA, CARLOS, EVA, HEALTH_OK, SESSION_401, mockFetch } from './test/fetchMock';
import { renderApp } from './test/renderApp';

describe('router', () => {
  // / sin sesión es rechazado y redirige a /login
  it('test_home_sin_sesion_redirige_a_login', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
    });
    const { router } = renderApp('/');

    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anon');
    expect(fetchMock.callsTo('GET', '/api/auth/session')[0]?.init?.credentials).toBe('include');
  });

  // /usuarios con un perfil que no es Admin es rechazado y redirige a / sin pedir el listado (FR-13)
  it('test_router_usuarios_con_perfil_editor_rechazado_redirige', async () => {
    for (const visitor of [EVA, { ...CARLOS, status: 'activo' as const }]) {
      const fetchMock = mockFetch({
        'GET /api/auth/session': { status: 200, body: { user: visitor } },
        'GET /api/health': HEALTH_OK,
      });
      const { router, view } = renderApp('/usuarios');

      await waitFor(() => { expect(router.state.location.pathname).toBe('/'); });
      expect(await screen.findByRole('heading', { name: `Hola, ${visitor.name}` })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Usuarios' })).not.toBeInTheDocument();
      expect(fetchMock.callsTo('GET', '/api/users')).toHaveLength(0);
      view.unmount();
    }

    // Contraste: la redirección depende del perfil; un Admin se queda en /usuarios.
    mockFetch({
      'GET /api/auth/session': { status: 200, body: { user: ANA } },
      'GET /api/health': HEALTH_OK,
      'GET /api/users': { status: 200, body: { users: [ANA] } },
    });
    const { router } = renderApp('/usuarios');
    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/usuarios');
  });

  it('/usuarios sin sesión redirige a /login', async () => {
    mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
    });
    const { router } = renderApp('/usuarios');

    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anon');
  });
});
