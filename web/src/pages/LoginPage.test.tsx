import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ANA, SESSION_401, deferred, mockFetch } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';

describe('LoginPage', () => {
  it('LoginPage con credenciales válidas navega a la pantalla principal', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      // Antes del login no hay sesión; después, el loader de `/` la encuentra.
      'GET /api/auth/session': [SESSION_401, { status: 200, body: { user: ANA } }],
      'POST /api/auth/login': { status: 200, body: { user: ANA } },
    });
    const { router, user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'ana@aldebaran.test');
    await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { name: 'Hola, Ana Admin' })).toBeInTheDocument();

    const [loginCall] = fetchMock.callsTo('POST', '/api/auth/login');
    expect(loginCall?.body).toEqual({ email: 'ana@aldebaran.test', password: 'secreta123' });
    expect(loginCall?.init?.credentials).toBe('include');
    expect(new Headers(loginCall?.init?.headers).get('Content-Type')).toBe('application/json');
  });

  it('LoginPage con 401 muestra "Email o contraseña incorrectos" rechazado y limpia la contraseña', async () => {
    mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
      'POST /api/auth/login': { status: 401, body: { error: 'Email o contraseña incorrectos' } },
    });
    const { router, user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'ana@aldebaran.test');
    await user.type(screen.getByLabelText('Contraseña'), 'equivocada');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText('Email o contraseña incorrectos')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Contraseña')).toHaveValue(''));
    expect(screen.getByLabelText('Email')).toHaveValue('ana@aldebaran.test');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('error de red en el login muestra "No se pudo conectar con el servidor" (error)', async () => {
    mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
      'POST /api/auth/login': 'network-error',
    });
    const { router, user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'ana@aldebaran.test');
    await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled());
    expect(router.state.location.pathname).toBe('/login');
  });

  it.each([
    ['401', SESSION_401],
    ['5xx', { status: 500, body: { error: 'Error interno' } }],
  ])(
    'login 200 y luego session %s en el loader de / vuelve a /login con el formulario habilitado (regresión)',
    async (_case, homeSession) => {
      const fetchMock = mockFetch({
        'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
        // loader de /login, loader de / tras el login (falla) y loader de /login otra vez.
        'GET /api/auth/session': [SESSION_401, homeSession, SESSION_401],
        'POST /api/auth/login': { status: 200, body: { user: ANA } },
      });
      const { router, user } = renderApp('/login');

      await user.type(await screen.findByLabelText('Email'), 'ana@aldebaran.test');
      await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
      await user.click(screen.getByRole('button', { name: 'Ingresar' }));

      await waitFor(() => expect(fetchMock.callsTo('GET', '/api/auth/session')).toHaveLength(3));
      await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
      expect(router.state.location.pathname).toBe('/login');
      // `/Ingresar/`: en jsdom la animación de salida del ícono de carga no termina y deja "loading" en el nombre.
      await waitFor(() => expect(screen.getByRole('button', { name: /Ingresar/ })).toBeEnabled());
      expect(screen.getByLabelText('Email')).toBeEnabled();
      expect(screen.getByLabelText('Contraseña')).toBeEnabled();
    },
  );

  it('5xx en el login muestra "No se pudo conectar con el servidor" (error)', async () => {
    mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
      'POST /api/auth/login': { status: 500, body: { error: 'Error interno' } },
    });
    const { router, user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'ana@aldebaran.test');
    await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(screen.queryByText('Error interno')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled());
    expect(router.state.location.pathname).toBe('/login');
  });

  it('415 en el login muestra el mensaje del servidor', async () => {
    mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
      'POST /api/auth/login': { status: 415, body: { error: 'Content-Type debe ser application/json' } },
    });
    const { router, user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'ana@aldebaran.test');
    await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText('Content-Type debe ser application/json')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled());
    expect(router.state.location.pathname).toBe('/login');
  });

  it('el formulario de login queda deshabilitado durante el envío', async () => {
    const pendingLogin = deferred();
    mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
      'POST /api/auth/login': pendingLogin.reply,
    });
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'ana@aldebaran.test');
    await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Ingresar/ })).toBeDisabled());
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Contraseña')).toBeDisabled();

    pendingLogin.resolve({ status: 401, body: { error: 'Email o contraseña incorrectos' } });

    expect(await screen.findByText('Email o contraseña incorrectos')).toBeInTheDocument();
    // `/Ingresar/`: en jsdom la animación de salida del ícono de carga no termina y deja "loading" en el nombre.
    await waitFor(() => expect(screen.getByRole('button', { name: /Ingresar/ })).toBeEnabled());
    expect(screen.getByLabelText('Contraseña')).toBeEnabled();
  });
});
