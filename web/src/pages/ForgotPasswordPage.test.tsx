import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockFetch } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';

const RESET_MESSAGE =
  'Si el email corresponde a un usuario activo, te enviamos un enlace para definir una nueva contraseña. Revisá tu casilla.';

describe('ForgotPasswordPage', () => {
  // Envía el email y muestra el mensaje fijo del server, con un enlace al login (AC-01, AC-03).
  it('test_forgot_password_muestra_mensaje_fijo', async () => {
    const fetchMock = mockFetch({ 'POST /api/auth/password-reset': { status: 200, body: { message: RESET_MESSAGE } } });
    const { router, user } = renderApp('/recuperar');

    expect(await screen.findByRole('heading', { name: 'Recuperar la contraseña' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'ana@aldebaran.test');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByText(RESET_MESSAGE)).toBeInTheDocument();
    const calls = fetchMock.callsTo('POST', '/api/auth/password-reset');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ email: 'ana@aldebaran.test' });
    expect(screen.getByRole('link', { name: 'Volver al inicio de sesión' })).toHaveAttribute('href', '/login');
    expect(router.state.location.pathname).toBe('/recuperar');
  });

  // Al enviar, el foco pasa al mensaje: el formulario desaparece y el lector de pantalla lo anuncia (W5).
  it('el foco pasa al mensaje después de enviar', async () => {
    mockFetch({ 'POST /api/auth/password-reset': { status: 200, body: { message: RESET_MESSAGE } } });
    const { user } = renderApp('/recuperar');

    await user.type(await screen.findByLabelText('Email'), 'ana@aldebaran.test');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByText(RESET_MESSAGE)).toBeInTheDocument();
    await waitFor(() => { expect(document.activeElement).toContainElement(screen.getByText(RESET_MESSAGE)); });
    expect(document.activeElement).not.toBe(document.body);
  });

  // "no-es-email" no pasa la validación del formulario: no se llama a la API (sad path).
  it('test_forgot_password_email_invalido_rechazado', async () => {
    const fetchMock = mockFetch({ 'POST /api/auth/password-reset': { status: 200, body: { message: RESET_MESSAGE } } });
    const { user } = renderApp('/recuperar');

    await user.type(await screen.findByLabelText('Email'), 'no-es-email');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByText('El email no tiene un formato válido')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByRole('button', { name: /Enviar enlace/ })).toBeEnabled(); });
    expect(fetchMock.callsTo('POST', '/api/auth/password-reset')).toHaveLength(0);
    expect(screen.queryByText(RESET_MESSAGE)).not.toBeInTheDocument();
  });

  // Un 429 o un error de red se muestran en pantalla y el formulario conserva el email.
  it('un error del pedido muestra el mensaje y conserva el email', async () => {
    mockFetch({
      'POST /api/auth/password-reset': [
        { status: 429, body: { error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' } },
        'network-error',
      ],
    });
    const { user } = renderApp('/recuperar');

    await user.type(await screen.findByLabelText('Email'), 'ana@aldebaran.test');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByText('Demasiados intentos. Probá de nuevo en 15 minutos.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('ana@aldebaran.test');

    await waitFor(() => { expect(screen.getByRole('button', { name: /Enviar enlace/ })).toBeEnabled(); });
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }));
    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('ana@aldebaran.test');
  });
});
