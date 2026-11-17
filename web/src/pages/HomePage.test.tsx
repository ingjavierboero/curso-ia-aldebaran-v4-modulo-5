import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { ANA, CARLOS, EVA, HEALTH_OK, SESSION_401, deferred, mockFetch } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';
import { EMPTY_SETTINGS } from '../test/settingsFixtures';

describe('HomePage', () => {
  // La pantalla principal muestra el banner de salud cuando el sistema está degradado (FR-07)
  it('test_home_muestra_banner_con_estado_degradado', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': { status: 200, body: { user: ANA } },
      'GET /api/health': { status: 503, body: { status: 'degradado' } },
    });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    // "Degradado" sin detalle: el banner confirma la sesión (una vez, además del loader de `/`)
    // y, con la sesión válida, nombra la base (FEAT-004).
    await waitFor(() => { expect(fetchMock.callsTo('GET', '/api/auth/session')).toHaveLength(2); });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Base de datos');
    expect(fetchMock.callsTo('GET', '/api/health')[0]?.init?.credentials).toBe('include');
    expect(fetchMock.callsTo('GET', '/api/auth/session')).toHaveLength(2);
    expect(fetchMock.callsTo('GET', '/api/auth/session')[1]?.init?.credentials).toBe('include');
  });

  // El acceso a la pantalla de usuarios se ofrece solo a un Admin (FR-13).
  it('test_home_muestra_acceso_a_usuarios_solo_a_admin', async () => {
    for (const visitor of [EVA, { ...CARLOS, status: 'activo' as const }]) {
      mockFetch({
        'GET /api/auth/session': { status: 200, body: { user: visitor } },
        'GET /api/health': HEALTH_OK,
      });
      const { view } = renderApp('/');
      expect(await screen.findByRole('heading', { name: `Hola, ${visitor.name}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Usuarios' })).not.toBeInTheDocument();
      view.unmount();
    }

    mockFetch({
      'GET /api/auth/session': { status: 200, body: { user: ANA } },
      'GET /api/health': HEALTH_OK,
      'GET /api/users': { status: 200, body: { users: [ANA, EVA] } },
    });
    const { router, user } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usuarios' }));

    await waitFor(() => { expect(router.state.location.pathname).toBe('/usuarios'); });
    // Por texto y no por rol: con la tabla de antd montada, `*ByRole('row')` es muy lento en jsdom.
    expect((await screen.findByText('eva@aldebaran.test')).closest('tr')).toHaveTextContent('Eva Editora');
  });

  // Clientes y productos se ofrecen a los tres perfiles (FEAT-010).
  it('los accesos a clientes y productos se muestran a los tres perfiles', async () => {
    for (const visitor of [ANA, EVA, { ...CARLOS, status: 'activo' as const }]) {
      mockFetch({
        'GET /api/auth/session': { status: 200, body: { user: visitor } },
        'GET /api/health': HEALTH_OK,
        'GET /api/clients': { status: 200, body: { clients: [] } },
        'GET /api/products': { status: 200, body: { products: [] } },
      });
      const { router, user, view } = renderApp('/');
      expect(await screen.findByRole('heading', { name: `Hola, ${visitor.name}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Productos' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Clientes' }));
      await waitFor(() => { expect(router.state.location.pathname).toBe('/clientes'); });
      expect(await screen.findByText('Clientes', { selector: 'h3' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Productos' }));
      await waitFor(() => { expect(router.state.location.pathname).toBe('/productos'); });
      expect(await screen.findByText('Productos', { selector: 'h3' })).toBeInTheDocument();
      view.unmount();
    }
  });

  // La configuración de facturación se ofrece a los tres perfiles (FEAT-011, FR-01).
  it('el acceso a configuración se muestra a los tres perfiles', async () => {
    for (const visitor of [ANA, EVA, { ...CARLOS, status: 'activo' as const }]) {
      mockFetch({
        'GET /api/auth/session': { status: 200, body: { user: visitor } },
        'GET /api/health': HEALTH_OK,
        'GET /api/settings/billing': { status: 200, body: EMPTY_SETTINGS },
      });
      const { router, user, view } = renderApp('/');
      expect(await screen.findByRole('heading', { name: `Hola, ${visitor.name}` })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Configuración' }));
      await waitFor(() => { expect(router.state.location.pathname).toBe('/configuracion'); });
      expect(await screen.findByText('Configuración', { selector: 'h3' })).toBeInTheDocument();
      view.unmount();
    }
  });

  it('la revalidación por focus actualiza el perfil y saca el acceso a usuarios a quien dejó de ser Admin', async () => {
    mockFetch({
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, { status: 200, body: { user: { ...ANA, role: 'consulta' } } }],
      'GET /api/health': HEALTH_OK,
    });
    renderApp('/');

    expect(await screen.findByRole('button', { name: 'Usuarios' })).toBeInTheDocument();
    act(() => {
      fireEvent.focus(window);
    });

    await waitFor(() => { expect(useAuthStore.getState().user?.role).toBe('consulta'); });
    expect(screen.queryByRole('button', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('un error de red en la revalidación por focus no saca al usuario de la pantalla', async () => {
    const fetchMock = mockFetch({
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, 'network-error'],
      'GET /api/health': HEALTH_OK,
    });
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.focus(window);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchMock.callsTo('GET', '/api/auth/session')).toHaveLength(2);
    expect(router.state.location.pathname).toBe('/');
    expect(useAuthStore.getState().status).toBe('authed');
    expect(screen.getByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
  });

  it('un error del servidor al cerrar sesión se informa y deja volver a intentar', async () => {
    const fetchMock = mockFetch({
      'GET /api/auth/session': { status: 200, body: { user: ANA } },
      'GET /api/health': HEALTH_OK,
      'POST /api/auth/logout': { status: 503, body: { error: 'caído' } },
    });
    const { router, user } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(useAuthStore.getState().status).toBe('authed');
    // `/Cerrar sesión/`: en jsdom el ícono de carga de antd puede quedar en el nombre accesible.
    await waitFor(() => { expect(screen.getByRole('button', { name: /Cerrar sesión/ })).toBeEnabled(); });
    expect(fetchMock.callsTo('POST', '/api/auth/logout')).toHaveLength(1);
  });

  // HomePage al cerrar sesión navega a /login
  it('test_home_page_cerrar_sesion_navega_a_login', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/health': HEALTH_OK,
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, SESSION_401],
      'POST /api/auth/logout': { status: 204 },
    });
    const { router, user } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anon');

    const [logoutCall] = fetchMock.callsTo('POST', '/api/auth/logout');
    expect(logoutCall?.init?.credentials).toBe('include');
    // Block 4 responde 415 a un POST sin JSON, incluido el logout.
    expect(new Headers(logoutCall?.init?.headers).get('Content-Type')).toBe('application/json');
    expect(logoutCall?.body).toEqual({});
  });

  // 401 en getSession desde la pantalla principal (sesión vencida) es rechazado y lleva a /login
  it('test_get_session_401_desde_home_sesion_vencida_lleva_a_login', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/health': HEALTH_OK,
      // La primera consulta (loader de `/`) es válida; la que hace la pantalla al volver a tener
      // foco encuentra la sesión vencida.
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, SESSION_401],
    });
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('authed');

    act(() => {
      fireEvent.focus(window);
    });

    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(useAuthStore.getState().status).toBe('anon');
    expect(useAuthStore.getState().user).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Hola, Ana Admin' })).not.toBeInTheDocument();
    expect(fetchMock.callsTo('GET', '/api/auth/session').length).toBeGreaterThanOrEqual(2);
  });

  it('401 en el logout deja el store en anon y lleva a /login', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/health': HEALTH_OK,
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, SESSION_401],
      'POST /api/auth/logout': SESSION_401,
    });
    const { router, user } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anon');
    expect(useAuthStore.getState().user).toBeNull();
    expect(fetchMock.callsTo('POST', '/api/auth/logout')).toHaveLength(1);
  });

  it('una revalidación por focus que responde después del logout no vuelve a dejar el store en authed (regresión)', async () => {
    const lateSession = deferred();
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/health': HEALTH_OK,
      // loader de /, revalidación por focus (queda en vuelo) y loader de /login tras el logout.
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, lateSession.reply, SESSION_401],
      'POST /api/auth/logout': { status: 204 },
    });
    const { router, user } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    act(() => {
      fireEvent.focus(window);
    });
    await waitFor(() => { expect(fetchMock.callsTo('GET', '/api/auth/session')).toHaveLength(2); });

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(useAuthStore.getState().status).toBe('anon');

    // La sesión que estaba en vuelo responde tarde con 200.
    await act(async () => {
      lateSession.resolve({ status: 200, body: { user: ANA } });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(useAuthStore.getState().status).toBe('anon');
    expect(useAuthStore.getState().user).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('401 en el logout no muestra "Sesión no válida" en la pantalla principal mientras navega a /login', async () => {
    const loginLoaderSession = deferred();
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/health': HEALTH_OK,
      // La consulta del loader de /login queda en vuelo: la pantalla principal sigue montada.
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, loginLoaderSession.reply],
      'POST /api/auth/logout': SESSION_401,
    });
    const { router, user } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => { expect(fetchMock.callsTo('GET', '/api/auth/session')).toHaveLength(2); });
    // Todavía en la pantalla principal (la navegación a /login espera su loader).
    expect(router.state.location.pathname).toBe('/');
    // `/Cerrar sesión/`: en jsdom el ícono de carga de antd puede quedar en el nombre accesible.
    expect(screen.getByRole('button', { name: /Cerrar sesión/ })).toBeInTheDocument();
    expect(screen.queryByText('Sesión no válida')).not.toBeInTheDocument();

    // act con un callback que devuelve una promesa: se comporta como el act asíncrono (vacía las
    // actualizaciones pendientes al resolverla), sin un `async` que no espera nada.
    await act(() => {
      loginLoaderSession.resolve(SESSION_401);
      return Promise.resolve();
    });
    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(useAuthStore.getState().status).toBe('anon');
  });
});
