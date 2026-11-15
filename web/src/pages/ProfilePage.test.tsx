import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RouteReply } from '../test/fetchMock';
import { ANA, CARLOS, EVA, HEALTH_OK, mockFetch } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';

/** El usuario de AC-02: Editor, "Ana Pérez", ana@empresa.com. */
const ANA_PEREZ = {
  id: 'u-9',
  name: 'Ana Pérez',
  email: 'ana@empresa.com',
  role: 'editor',
  status: 'activo',
} as const;

const CURRENT = 'actual-123';
const NEXT = 'nueva-4567';

/** Rutas de una sesión de Ana Pérez en "Mi perfil", con la respuesta indicada al cambio de contraseña. */
function profileRoutes(passwordReply: RouteReply) {
  return {
    'GET /api/auth/session': { status: 200, body: { user: ANA_PEREZ } },
    'GET /api/health': HEALTH_OK,
    'POST /api/auth/password': passwordReply,
  };
}

async function openProfile() {
  const rendered = renderApp('/perfil');
  expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
  return rendered;
}

describe('ProfilePage', () => {
  // Admin, Editor y Consulta ven el acceso a "Mi perfil" y los lleva a la pantalla (AC-01).
  it('test_layout_muestra_mi_perfil_para_los_tres_perfiles', async () => {
    for (const visitor of [ANA, EVA, { ...CARLOS, status: 'activo' as const }]) {
      mockFetch({
        'GET /api/auth/session': { status: 200, body: { user: visitor } },
        'GET /api/health': HEALTH_OK,
        'POST /api/auth/password': { status: 204 },
      });
      const { router, user, view } = renderApp('/');
      expect(await screen.findByRole('heading', { name: `Hola, ${visitor.name}` })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Mi perfil' }));

      await waitFor(() => { expect(router.state.location.pathname).toBe('/perfil'); });
      expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
      view.unmount();
    }
  });

  // Nombre, email y perfil se muestran como texto, sin campos para modificarlos (AC-02).
  it('test_profile_page_muestra_datos_solo_lectura', async () => {
    mockFetch(profileRoutes({ status: 204 }));
    await openProfile();

    const data = screen.getByRole('region', { name: 'Datos del usuario' });
    expect(within(data).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(data).getByText('ana@empresa.com')).toBeInTheDocument();
    expect(within(data).getByText('Editor')).toBeInTheDocument();
    // Ningún campo editable para los datos: solo los tres de contraseña (que no tienen rol textbox).
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryByDisplayValue('Ana Pérez')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('ana@empresa.com')).not.toBeInTheDocument();
  });

  // Un cambio aceptado envía el POST, muestra la confirmación y vacía el formulario (AC-13).
  it('test_profile_page_cambio_exitoso_confirma_y_vacia', async () => {
    const fetchMock = mockFetch(profileRoutes({ status: 204 }));
    const { user } = await openProfile();

    await user.type(screen.getByLabelText('Contraseña actual'), CURRENT);
    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), NEXT);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('La contraseña se cambió')).toBeInTheDocument();
    const calls = fetchMock.callsTo('POST', '/api/auth/password');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ currentPassword: CURRENT, newPassword: NEXT });
    await waitFor(() => { expect(screen.getByLabelText('Contraseña actual')).toHaveValue(''); });
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('');
    expect(screen.getByLabelText('Repetir contraseña nueva')).toHaveValue('');
  });

  // Si la repetición no coincide, no se envía nada y se indica (AC-10).
  it('test_profile_page_repeticion_no_coincide_rechazado', async () => {
    const fetchMock = mockFetch(profileRoutes({ status: 204 }));
    const { user } = await openProfile();

    await user.type(screen.getByLabelText('Contraseña actual'), CURRENT);
    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), `${NEXT}x`);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    // El mensaje aparece cuando la validación del formulario ya terminó: si fuera a enviar, ya lo habría hecho.
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeEnabled();
    expect(fetchMock.callsTo('POST', '/api/auth/password')).toHaveLength(0);
    expect(screen.queryByText('La contraseña se cambió')).not.toBeInTheDocument();
  });

  // Un 400 por contraseña actual incorrecta muestra el mensaje del server y conserva lo ingresado (AC-14).
  it('test_profile_page_actual_incorrecta_muestra_error_rechazado', async () => {
    const fetchMock = mockFetch(profileRoutes({ status: 400, body: { error: 'La contraseña actual es incorrecta' } }));
    const { router, user } = await openProfile();

    await user.type(screen.getByLabelText('Contraseña actual'), 'otra-cosa');
    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), NEXT);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('La contraseña actual es incorrecta')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/auth/password')).toHaveLength(1);
    expect(screen.queryByText('La contraseña se cambió')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue(NEXT);
    expect(router.state.location.pathname).toBe('/perfil');
  });

  // Sin servidor, "No se pudo conectar con el servidor" (FR-10).
  it('test_profile_page_sin_servidor_error', async () => {
    mockFetch(profileRoutes('network-error'));
    const { router, user } = await openProfile();

    await user.type(screen.getByLabelText('Contraseña actual'), CURRENT);
    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), NEXT);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(screen.queryByText('La contraseña se cambió')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/perfil');
  });
});
