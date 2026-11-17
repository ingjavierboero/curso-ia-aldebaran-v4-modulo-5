import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from './store/authStore';
import { LOS_ANDES } from './test/catalogFixtures';
import { ANA, CARLOS, EVA, HEALTH_OK, SESSION_401, mockFetch } from './test/fetchMock';
import { renderApp } from './test/renderApp';
import { EMPTY_SETTINGS } from './test/settingsFixtures';

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

  // /perfil sin sesión es rechazado y redirige a /login (FR-01); con sesión, la pantalla se queda en /perfil.
  it('test_router_perfil_sin_sesion_no_autorizado', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
      'POST /api/auth/password': { status: 204 },
    });
    const { router, view } = renderApp('/perfil');

    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mi perfil' })).not.toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anon');
    expect(fetchMock.callsTo('POST', '/api/auth/password')).toHaveLength(0);
    view.unmount();

    // Contraste: la redirección depende de la sesión; con sesión, /perfil muestra la pantalla.
    mockFetch({
      'GET /api/auth/session': { status: 200, body: { user: EVA } },
      'GET /api/health': HEALTH_OK,
      'POST /api/auth/password': { status: 204 },
    });
    const withSession = renderApp('/perfil');
    expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(withSession.router.state.location.pathname).toBe('/perfil');
  });

  // /clientes, /clientes/:id y /productos exigen sesión; los tres perfiles entran (FEAT-010, AC-16).
  it('test_web_rutas_catalogo_requieren_sesion', async () => {
    const CATALOG_PATHS = ['/clientes', '/clientes/c-1', '/productos'];
    for (const path of CATALOG_PATHS) {
      const fetchMock = mockFetch({
        'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
        'GET /api/auth/session': SESSION_401,
      });
      const { router, view } = renderApp(path);

      await waitFor(() => { expect(router.state.location.pathname, path).toBe('/login'); });
      expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
      expect(useAuthStore.getState().status).toBe('anon');
      expect(fetchMock.calls.filter((c) => c.path.startsWith('/api/clients') || c.path.startsWith('/api/products'))).toHaveLength(0);
      view.unmount();
    }

    const client = { ...LOS_ANDES, products: [] };
    for (const visitor of [ANA, EVA, { ...CARLOS, status: 'activo' as const }]) {
      for (const [path, heading] of [
        ['/clientes', 'Clientes'],
        ['/clientes/c-1', 'Los Andes SA'],
        ['/productos', 'Productos'],
      ] as const) {
        mockFetch({
          'GET /api/auth/session': { status: 200, body: { user: visitor } },
          'GET /api/health': HEALTH_OK,
          'GET /api/clients': { status: 200, body: { clients: [LOS_ANDES] } },
          'GET /api/clients/c-1': { status: 200, body: { client } },
          'GET /api/products': { status: 200, body: { products: [] } },
        });
        const { router, view } = renderApp(path);
        expect(await screen.findByText(heading, { selector: 'h3' })).toBeInTheDocument();
        expect(router.state.location.pathname, `${visitor.role} ${path}`).toBe(path);
        view.unmount();
      }
    }
  });

  // /configuracion exige sesión (sin sesión, a /login sin pedir la configuración); los tres perfiles entran (FEAT-011).
  it('test_web_ruta_configuracion_sin_sesion_no_autorizado', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
    });
    const anon = renderApp('/configuracion');

    await waitFor(() => { expect(anon.router.state.location.pathname).toBe('/login'); });
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(screen.queryByText('Configuración', { selector: 'h3' })).not.toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anon');
    expect(fetchMock.calls.filter((c) => c.path.startsWith('/api/settings'))).toHaveLength(0);
    anon.view.unmount();

    for (const visitor of [ANA, EVA, { ...CARLOS, status: 'activo' as const }]) {
      mockFetch({
        'GET /api/auth/session': { status: 200, body: { user: visitor } },
        'GET /api/health': HEALTH_OK,
        'GET /api/settings/billing': { status: 200, body: EMPTY_SETTINGS },
      });
      const { router, view } = renderApp('/configuracion');
      expect(await screen.findByText('Configuración', { selector: 'h3' })).toBeInTheDocument();
      expect(await screen.findByLabelText('Hora de facturación')).toHaveValue('11:00');
      expect(router.state.location.pathname, visitor.role).toBe('/configuracion');
      view.unmount();
    }
  });

  // /recuperar y /recuperar/:token son públicas: no piden sesión ni el estado del setup (FEAT-008).
  // El enlace se valida una sola vez, en el loader; un 401 inesperado no lleva al login.
  it('las rutas de recuperación no piden sesión y validan el enlace una vez', async () => {
    // Sin rutas declaradas: cualquier llamada (sesión, setup) queda como no simulada y falla el test.
    mockFetch({});
    const forgot = renderApp('/recuperar');
    expect(await screen.findByRole('heading', { name: 'Recuperar la contraseña' })).toBeInTheDocument();
    expect(forgot.router.state.location.pathname).toBe('/recuperar');
    forgot.view.unmount();

    const fetchMock = mockFetch({ 'POST /api/auth/password-reset/check': { status: 204 } });
    const reset = renderApp('/recuperar/abc');
    expect(await screen.findByRole('heading', { name: 'Definir una nueva contraseña' })).toBeInTheDocument();
    expect(reset.router.state.location.pathname).toBe('/recuperar/abc');
    expect(fetchMock.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/auth/password-reset/check']);
    reset.view.unmount();

    mockFetch({ 'POST /api/auth/password-reset/check': SESSION_401 });
    const unauthorized = renderApp('/recuperar/abc');
    expect(await screen.findByText('El enlace no es válido o venció')).toBeInTheDocument();
    expect(unauthorized.router.state.location.pathname).toBe('/recuperar/abc');
    expect(useAuthStore.getState().status).toBe('loading');
  });
});
