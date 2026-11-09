import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { ANA, SESSION_401, deferred, mockFetch } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';

describe('HomePage', () => {
  it('HomePage al cerrar sesión navega a /login', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, SESSION_401],
      'POST /api/auth/logout': { status: 204 },
    });
    const { router, user } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anon');

    const [logoutCall] = fetchMock.callsTo('POST', '/api/auth/logout');
    expect(logoutCall?.init?.credentials).toBe('include');
    // Block 4 responde 415 a un POST sin JSON, incluido el logout.
    expect(new Headers(logoutCall?.init?.headers).get('Content-Type')).toBe('application/json');
    expect(logoutCall?.body).toEqual({});
  });

  it('401 en getSession desde la pantalla principal (sesión vencida) es rechazado y lleva a /login', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
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

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(useAuthStore.getState().status).toBe('anon');
    expect(useAuthStore.getState().user).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Hola, Ana Admin' })).not.toBeInTheDocument();
    expect(fetchMock.callsTo('GET', '/api/auth/session').length).toBeGreaterThanOrEqual(2);
  });

  it('401 en el logout deja el store en anon y lleva a /login', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, SESSION_401],
      'POST /api/auth/logout': SESSION_401,
    });
    const { router, user } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anon');
    expect(useAuthStore.getState().user).toBeNull();
    expect(fetchMock.callsTo('POST', '/api/auth/logout')).toHaveLength(1);
  });

  it('una revalidación por focus que responde después del logout no vuelve a dejar el store en authed (regresión)', async () => {
    const lateSession = deferred();
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      // loader de /, revalidación por focus (queda en vuelo) y loader de /login tras el logout.
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, lateSession.reply, SESSION_401],
      'POST /api/auth/logout': { status: 204 },
    });
    const { router, user } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    act(() => {
      fireEvent.focus(window);
    });
    await waitFor(() => expect(fetchMock.callsTo('GET', '/api/auth/session')).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
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
      // La consulta del loader de /login queda en vuelo: la pantalla principal sigue montada.
      'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, loginLoaderSession.reply],
      'POST /api/auth/logout': SESSION_401,
    });
    const { router, user } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(fetchMock.callsTo('GET', '/api/auth/session')).toHaveLength(2));
    // Todavía en la pantalla principal (la navegación a /login espera su loader).
    expect(router.state.location.pathname).toBe('/');
    // `/Cerrar sesión/`: en jsdom el ícono de carga de antd puede quedar en el nombre accesible.
    expect(screen.getByRole('button', { name: /Cerrar sesión/ })).toBeInTheDocument();
    expect(screen.queryByText('Sesión no válida')).not.toBeInTheDocument();

    await act(async () => {
      loginLoaderSession.resolve(SESSION_401);
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(useAuthStore.getState().status).toBe('anon');
  });
});
