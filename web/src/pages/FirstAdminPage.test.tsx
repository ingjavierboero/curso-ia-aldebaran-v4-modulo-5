import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ANA, SESSION_401, mockFetch } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';

describe('FirstAdminPage', () => {
  // /login con needsFirstAdmin true redirige a /setup y FirstAdminPage crea el Admin y navega a /login
  it('test_login_con_needs_first_admin_redirige_a_setup_y_crea_admin', async () => {
    const fetchMock = mockFetch({
      // loader de /login, loader de /setup y, ya creado el Admin, de nuevo /login.
      'GET /api/setup/status': [
        { status: 200, body: { needsFirstAdmin: true } },
        { status: 200, body: { needsFirstAdmin: true } },
        { status: 200, body: { needsFirstAdmin: false } },
      ],
      'GET /api/auth/session': SESSION_401,
      'POST /api/setup/first-admin': { status: 201, body: { user: ANA } },
    });
    const { router, user } = renderApp('/login');

    await waitFor(() => { expect(router.state.location.pathname).toBe('/setup'); });
    await user.type(await screen.findByLabelText('Nombre'), 'Ana Admin');
    await user.type(screen.getByLabelText('Email'), 'ana@aldebaran.test');
    await user.type(screen.getByLabelText('Contraseña'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Crear Admin' }));

    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();

    const [call] = fetchMock.callsTo('POST', '/api/setup/first-admin');
    expect(call?.body).toEqual({ name: 'Ana Admin', email: 'ana@aldebaran.test', password: '12345678' });
    expect(call?.init?.credentials).toBe('include');
    expect(new Headers(call?.init?.headers).get('Content-Type')).toBe('application/json');
  });

  // FirstAdminPage con contraseña de 7 caracteres es rechazado en el formulario
  it('test_first_admin_page_contrasena_de_7_rechazado_en_el_formulario', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: true } },
      'POST /api/setup/first-admin': { status: 201, body: { user: ANA } },
    });
    const { router, user } = renderApp('/setup');

    await user.type(await screen.findByLabelText('Nombre'), 'Ana Admin');
    await user.type(screen.getByLabelText('Email'), 'ana@aldebaran.test');
    await user.type(screen.getByLabelText('Contraseña'), '1234567');
    await user.click(screen.getByRole('button', { name: 'Crear Admin' }));

    expect(await screen.findByText('La contraseña debe tener al menos 8 caracteres')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/setup/first-admin')).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/setup');
  });

  // /setup con usuarios existentes redirige a /login y un 409 duplicado rechazado navega a /login
  it('test_setup_con_usuarios_existentes_redirige_a_login_y_409_navega_a_login', async () => {
    // 1) Con usuarios existentes, /setup no se muestra.
    mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
      'GET /api/auth/session': SESSION_401,
    });
    const first = renderApp('/setup');
    await waitFor(() => { expect(first.router.state.location.pathname).toBe('/login'); });
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    first.view.unmount();

    // 2) Otro registro ganó la carrera: el POST responde 409.
    const fetchMock = mockFetch({
      'GET /api/setup/status': [
        { status: 200, body: { needsFirstAdmin: true } },
        { status: 200, body: { needsFirstAdmin: false } },
      ],
      'GET /api/auth/session': SESSION_401,
      'POST /api/setup/first-admin': { status: 409, body: { error: 'El primer Admin ya fue registrado' } },
    });
    const { router, user } = renderApp('/setup');

    await user.type(await screen.findByLabelText('Nombre'), 'Ana Admin');
    await user.type(screen.getByLabelText('Email'), 'ana@aldebaran.test');
    await user.type(screen.getByLabelText('Contraseña'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Crear Admin' }));

    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(await screen.findByText('El primer Admin ya fue registrado')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/setup/first-admin')).toHaveLength(1);
  });

  it('400 en el registro muestra el mensaje del servidor y no navega', async () => {
    const fetchMock = mockFetch({
      'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: true } },
      'POST /api/setup/first-admin': { status: 400, body: { error: 'El nombre no es válido' } },
    });
    const { router, user } = renderApp('/setup');

    await user.type(await screen.findByLabelText('Nombre'), 'Ana Admin');
    await user.type(screen.getByLabelText('Email'), 'ana@aldebaran.test');
    await user.type(screen.getByLabelText('Contraseña'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Crear Admin' }));

    expect(await screen.findByText('El nombre no es válido')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Crear Admin' })).toBeEnabled());
    expect(router.state.location.pathname).toBe('/setup');
    expect(fetchMock.callsTo('POST', '/api/setup/first-admin')).toHaveLength(1);
  });
});
