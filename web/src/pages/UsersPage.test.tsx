import { act, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { ANA, CARLOS, EVA, HEALTH_OK, SESSION_401, deferred, mockFetch, type RouteReply } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';

const FORBIDDEN = { status: 403, body: { error: 'No tenés permiso para realizar esta acción' } } as const;
const LIST = { status: 200, body: { users: [ANA, EVA, CARLOS] } } as const;

/** Rutas que toda visita a `/usuarios` consulta: la sesión (loader) y la salud (`HealthBanner`). */
function usersPageRoutes(routes: Record<string, RouteReply>): Record<string, RouteReply> {
  return {
    'GET /api/auth/session': { status: 200, body: { user: ANA } },
    'GET /api/health': HEALTH_OK,
    ...routes,
  };
}

// Los elementos se buscan por texto y no con `*ByRole`: con la tabla, el modal y el popconfirm de
// antd montados, cada consulta por rol tarda ~700 ms en jsdom (calcula estilos de cada ancestro sobre
// todo el CSS-in-JS inyectado) y la pantalla pasa el timeout de 5 s.

/** Fila de la tabla con ese nombre (el del usuario con sesión también está en el header). */
function rowOf(name: string): HTMLElement {
  const row = screen
    .queryAllByText(name)
    .map((el) => el.closest('tr'))
    .find((tr) => tr !== null);
  if (!row) throw new Error(`No hay una fila para "${name}"`);
  return row;
}

async function findRow(name: string): Promise<HTMLElement> {
  return waitFor(() => rowOf(name));
}

function queryButtonIn(container: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    within(container)
      .queryAllByText(label)
      .map((el) => el.closest('button'))
      .find((button) => button !== null) ?? null
  );
}

/** Botón con ese texto dentro de `container`. */
function buttonIn(container: HTMLElement, label: string): HTMLButtonElement {
  const button = queryButtonIn(container, label);
  if (!button) throw new Error(`No hay un botón "${label}"`);
  return button;
}

function queryDialog(title: string): HTMLElement | null {
  const titleEl = screen.queryByText(title, { selector: '.ant-modal-title' });
  return titleEl?.closest<HTMLElement>('[role="dialog"]') ?? null;
}

/** El modal con ese título (antd lo nombra con `aria-labelledby` apuntando al título). */
async function findDialog(title: string): Promise<HTMLElement> {
  return waitFor(() => {
    const dialog = queryDialog(title);
    if (!dialog) throw new Error(`No hay un modal "${title}"`);
    return dialog;
  });
}

/** "Dar de baja" en la fila y la confirmación del popconfirm. */
async function deactivate(user: UserEvent, name: string): Promise<void> {
  await user.click(buttonIn(await findRow(name), 'Dar de baja'));
  await user.click(await waitFor(() => buttonIn(document.body, 'Confirmar')));
}

describe('UsersPage', () => {
  it('test_users_page_lista_usuarios_con_perfil_y_estado', async () => {
    const fetchMock = mockFetch(usersPageRoutes({ 'GET /api/users': LIST }));
    renderApp('/usuarios');

    const ana = await findRow('Ana Admin');
    expect(screen.getByText('Usuarios', { selector: 'h3' })).toBeInTheDocument();
    for (const header of ['Nombre', 'Email', 'Perfil', 'Estado']) {
      expect(screen.getByText(header, { selector: 'th' })).toBeInTheDocument();
    }

    expect(within(ana).getByText('ana@aldebaran.test')).toBeInTheDocument();
    expect(within(ana).getByText('Admin')).toBeInTheDocument();
    expect(within(ana).getByText('Activo')).toBeInTheDocument();

    const eva = rowOf('Eva Editora');
    expect(within(eva).getByText('Editor')).toBeInTheDocument();
    expect(within(eva).getByText('Activo')).toBeInTheDocument();
    // Cada acción nombra al usuario: un lector de pantalla no repite "Modificar" sin contexto.
    expect(buttonIn(eva, 'Modificar')).toHaveAttribute('aria-label', 'Modificar a Eva Editora');
    expect(buttonIn(eva, 'Dar de baja')).toHaveAttribute('aria-label', 'Dar de baja a Eva Editora');

    // Los Inactivos también se listan, con la acción de reactivar en lugar de la baja.
    const carlos = rowOf('Carlos Consulta');
    expect(within(carlos).getByText('Consulta')).toBeInTheDocument();
    expect(within(carlos).getByText('Inactivo')).toBeInTheDocument();
    expect(buttonIn(carlos, 'Reactivar')).toHaveAttribute('aria-label', 'Reactivar a Carlos Consulta');
    expect(queryButtonIn(carlos, 'Dar de baja')).toBeNull();

    expect(buttonIn(document.body, 'Nuevo usuario')).toBeInTheDocument();
    expect(fetchMock.callsTo('GET', '/api/users')[0]?.init?.credentials).toBe('include');
  });

  it('test_users_page_alta_recarga_el_listado', async () => {
    const NUEVO = { id: 'u-4', name: 'Nora Nueva', email: 'nora@aldebaran.test', role: 'editor', status: 'activo' };
    const fetchMock = mockFetch(
      usersPageRoutes({
        'GET /api/users': [LIST, { status: 200, body: { users: [ANA, EVA, CARLOS, NUEVO] } }],
        'POST /api/users': { status: 201, body: { user: NUEVO } },
      }),
    );
    const { user } = renderApp('/usuarios');

    await findRow('Ana Admin');
    await user.click(buttonIn(document.body, 'Nuevo usuario'));
    const dialog = await findDialog('Nuevo usuario');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Validación del formulario: sin datos no se envía nada.
    await user.click(buttonIn(dialog, 'Guardar'));
    expect(await within(dialog).findByText('Ingresá el nombre')).toBeInTheDocument();
    expect(within(dialog).getByText('Ingresá el email')).toBeInTheDocument();
    expect(within(dialog).getByText('Elegí un perfil')).toBeInTheDocument();
    expect(within(dialog).getByText('Ingresá una contraseña')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Nombre'), 'Nora Nueva');
    await user.type(within(dialog).getByLabelText('Email'), 'nora@aldebaran.test');
    await user.click(within(dialog).getByLabelText('Editor'));
    await user.type(within(dialog).getByLabelText('Contraseña inicial'), 'corta12');
    await user.click(buttonIn(dialog, 'Guardar'));
    expect(await within(dialog).findByText('La contraseña debe tener al menos 8 caracteres')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/users')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText('Contraseña inicial'), '3');
    await user.click(buttonIn(dialog, 'Guardar'));

    const nora = await findRow('Nora Nueva');
    expect(within(nora).getByText('Editor')).toBeInTheDocument();
    expect(within(nora).getByText('Activo')).toBeInTheDocument();
    await waitFor(() => { expect(queryDialog('Nuevo usuario')).toBeNull(); });

    const [postCall] = fetchMock.callsTo('POST', '/api/users');
    expect(postCall?.body).toEqual({ name: 'Nora Nueva', email: 'nora@aldebaran.test', role: 'editor', password: 'corta123' });
    expect(new Headers(postCall?.init?.headers).get('Content-Type')).toBe('application/json');
    expect(fetchMock.callsTo('GET', '/api/users')).toHaveLength(2);
  });

  it('test_users_page_email_duplicado_muestra_error_rechazado', async () => {
    const fetchMock = mockFetch(
      usersPageRoutes({
        'GET /api/users': LIST,
        'POST /api/users': { status: 409, body: { error: 'Ya existe un usuario con ese email' } },
      }),
    );
    const { user } = renderApp('/usuarios');

    await findRow('Ana Admin');
    await user.click(buttonIn(document.body, 'Nuevo usuario'));
    const dialog = await findDialog('Nuevo usuario');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Otra Ana');
    await user.type(within(dialog).getByLabelText('Email'), 'Ana@Aldebaran.test');
    await user.click(within(dialog).getByLabelText('Consulta'));
    await user.type(within(dialog).getByLabelText('Contraseña inicial'), 'secreta12');
    await user.click(buttonIn(dialog, 'Guardar'));

    // El mensaje del server en el formulario, que sigue abierto; el listado no cambia ni se recarga.
    expect(await within(dialog).findByText('Ya existe un usuario con ese email')).toBeInTheDocument();
    expect(queryDialog('Nuevo usuario')).not.toBeNull();
    expect(() => rowOf('Otra Ana')).toThrow();
    expect(fetchMock.callsTo('POST', '/api/users')).toHaveLength(1);
    expect(fetchMock.callsTo('GET', '/api/users')).toHaveLength(1);
  });

  it('modificar envía nombre, email y perfil por PATCH y recarga el listado', async () => {
    const EVA_CONSULTA = { ...EVA, name: 'Eva María', email: 'evam@aldebaran.test', role: 'consulta' };
    const fetchMock = mockFetch(
      usersPageRoutes({
        'GET /api/users': [LIST, { status: 200, body: { users: [ANA, EVA_CONSULTA, CARLOS] } }],
        'PATCH /api/users/u-2': { status: 200, body: { user: EVA_CONSULTA } },
      }),
    );
    const { user } = renderApp('/usuarios');

    await user.click(buttonIn(await findRow('Eva Editora'), 'Modificar'));
    const dialog = await findDialog('Modificar usuario');
    // Precargado con los datos actuales y sin contraseña (solo en el alta).
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Eva Editora');
    expect(within(dialog).getByLabelText('Email')).toHaveValue('eva@aldebaran.test');
    expect(within(dialog).getByLabelText('Editor')).toBeChecked();
    expect(within(dialog).queryByLabelText('Contraseña inicial')).not.toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Nombre'));
    await user.type(within(dialog).getByLabelText('Nombre'), 'Eva María');
    await user.clear(within(dialog).getByLabelText('Email'));
    await user.type(within(dialog).getByLabelText('Email'), 'evam@aldebaran.test');
    await user.click(within(dialog).getByLabelText('Consulta'));
    await user.click(buttonIn(dialog, 'Guardar'));

    const eva = await findRow('Eva María');
    expect(within(eva).getByText('evam@aldebaran.test')).toBeInTheDocument();
    expect(within(eva).getByText('Consulta')).toBeInTheDocument();
    const [patchCall] = fetchMock.callsTo('PATCH', '/api/users/u-2');
    expect(patchCall?.body).toEqual({ name: 'Eva María', email: 'evam@aldebaran.test', role: 'consulta' });
    expect(new Headers(patchCall?.init?.headers).get('Content-Type')).toBe('application/json');
    expect(fetchMock.callsTo('GET', '/api/users')).toHaveLength(2);
  });

  it('test_users_page_baja_y_reactivacion', async () => {
    const EVA_INACTIVA = { ...EVA, status: 'inactivo' };
    const fetchMock = mockFetch(
      usersPageRoutes({
        'GET /api/users': [
          LIST,
          { status: 200, body: { users: [ANA, EVA_INACTIVA, CARLOS] } },
          { status: 200, body: { users: [ANA, EVA, CARLOS] } },
        ],
        'POST /api/users/u-2/deactivate': { status: 200, body: { user: EVA_INACTIVA } },
        'POST /api/users/u-2/reactivate': { status: 200, body: { user: EVA } },
      }),
    );
    const { user } = renderApp('/usuarios');

    // La baja pide confirmación: sin confirmar no se envía nada.
    await user.click(buttonIn(await findRow('Eva Editora'), 'Dar de baja'));
    expect(await screen.findByText('¿Dar de baja a Eva Editora?')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/users/u-2/deactivate')).toHaveLength(0);
    await user.click(buttonIn(document.body, 'Confirmar'));

    await waitFor(() => { expect(within(rowOf('Eva Editora')).getByText('Inactivo')).toBeInTheDocument(); });
    const [deactivateCall] = fetchMock.callsTo('POST', '/api/users/u-2/deactivate');
    expect(deactivateCall?.body).toEqual({});
    expect(new Headers(deactivateCall?.init?.headers).get('Content-Type')).toBe('application/json');

    await user.click(buttonIn(rowOf('Eva Editora'), 'Reactivar'));
    await waitFor(() => { expect(within(rowOf('Eva Editora')).getByText('Activo')).toBeInTheDocument(); });
    expect(fetchMock.callsTo('POST', '/api/users/u-2/reactivate')[0]?.body).toEqual({});
    expect(fetchMock.callsTo('GET', '/api/users')).toHaveLength(3);
  });

  it('una recarga más vieja y más lenta no pisa el listado de una recarga más nueva', async () => {
    const slowReload = deferred();
    const EVA_INACTIVA = { ...EVA, status: 'inactivo' };
    const NUEVO = { id: 'u-4', name: 'Nora Nueva', email: 'nora@aldebaran.test', role: 'consulta', status: 'activo' };
    mockFetch(
      usersPageRoutes({
        // Carga inicial; recarga tras la baja de Eva (queda en vuelo); recarga tras el alta de Nora.
        'GET /api/users': [LIST, slowReload.reply, { status: 200, body: { users: [ANA, EVA_INACTIVA, CARLOS, NUEVO] } }],
        'POST /api/users/u-2/deactivate': { status: 200, body: { user: EVA_INACTIVA } },
        'POST /api/users': { status: 201, body: { user: NUEVO } },
      }),
    );
    const { user } = renderApp('/usuarios');

    // Mientras la recarga de la baja sigue en vuelo, un alta dispara otra recarga, que responde antes.
    await deactivate(user, 'Eva Editora');
    await user.click(buttonIn(document.body, 'Nuevo usuario'));
    const dialog = await findDialog('Nuevo usuario');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Nora Nueva');
    await user.type(within(dialog).getByLabelText('Email'), 'nora@aldebaran.test');
    await user.click(within(dialog).getByLabelText('Consulta'));
    await user.type(within(dialog).getByLabelText('Contraseña inicial'), 'secreta12');
    await user.click(buttonIn(dialog, 'Guardar'));
    await findRow('Nora Nueva');

    // La recarga vieja responde tarde, con el listado anterior al alta: se descarta.
    await act(async () => {
      slowReload.resolve({ status: 200, body: { users: [ANA, EVA_INACTIVA, CARLOS] } });
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(rowOf('Nora Nueva')).toBeInTheDocument();
    expect(within(rowOf('Eva Editora')).getByText('Inactivo')).toBeInTheDocument();
  });

  it('test_users_page_ultimo_admin_muestra_conflicto_rechazado', async () => {
    const fetchMock = mockFetch(
      usersPageRoutes({
        'GET /api/users': LIST,
        'POST /api/users/u-1/deactivate': {
          status: 409,
          body: { error: 'No se puede dejar el sistema sin un Admin Activo' },
        },
      }),
    );
    const { user } = renderApp('/usuarios');

    await deactivate(user, 'Ana Admin');

    expect(await screen.findByText('No se puede dejar el sistema sin un Admin Activo')).toBeInTheDocument();
    const ana = rowOf('Ana Admin');
    expect(within(ana).getByText('Activo')).toBeInTheDocument();
    expect(within(ana).getByText('Admin')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/users/u-1/deactivate')).toHaveLength(1);
    expect(fetchMock.callsTo('GET', '/api/users')).toHaveLength(1);
  });

  it('test_users_page_error_de_red_conserva_listado', async () => {
    const fetchMock = mockFetch(
      usersPageRoutes({
        'GET /api/users': [LIST, 'network-error'],
        'POST /api/users/u-2/deactivate': { status: 200, body: { user: { ...EVA, status: 'inactivo' } } },
      }),
    );
    const { user } = renderApp('/usuarios');

    await deactivate(user, 'Eva Editora');

    // La recarga falla: aviso y el listado anterior se conserva.
    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(fetchMock.callsTo('GET', '/api/users')).toHaveLength(2);
    expect(rowOf('Ana Admin')).toBeInTheDocument();
    expect(within(rowOf('Eva Editora')).getByText('Activo')).toBeInTheDocument();
    expect(within(rowOf('Carlos Consulta')).getByText('Inactivo')).toBeInTheDocument();
  });

  it('test_users_page_403_no_autorizado_refresca_y_vuelve_al_inicio', async () => {
    const ANA_EDITORA = { ...ANA, role: 'editor' };
    const fetchMock = mockFetch(
      usersPageRoutes({
        // El loader de /usuarios la ve Admin; mientras la pantalla está abierta, otro Admin la pasa a Editor.
        'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, { status: 200, body: { user: ANA_EDITORA } }],
        'GET /api/users': LIST,
        'POST /api/users/u-2/deactivate': FORBIDDEN,
      }),
    );
    const { router, user } = renderApp('/usuarios');

    await deactivate(user, 'Eva Editora');

    await waitFor(() => { expect(router.state.location.pathname).toBe('/'); });
    expect(await screen.findByText('Hola, Ana Admin', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('No tenés permiso para realizar esta acción')).toBeInTheDocument();
    expect(useAuthStore.getState().user?.role).toBe('editor');
    expect(queryButtonIn(document.body, 'Usuarios')).toBeNull();
    expect(fetchMock.callsTo('GET', '/api/auth/session').length).toBeGreaterThanOrEqual(2);
    // Una vez mostrado, el aviso sale del historial: recargar la página (F5) no lo repite.
    await waitFor(() => { expect(router.state.location.state).toBeNull(); });
    expect(screen.getByText('No tenés permiso para realizar esta acción')).toBeInTheDocument();
  });

  it('test_users_page_401_tras_darse_de_baja_lleva_al_login', async () => {
    const BETO = { id: 'u-5', name: 'Beto Admin', email: 'beto@aldebaran.test', role: 'admin', status: 'activo' };
    mockFetch(
      usersPageRoutes({
        'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
        // Loader de /usuarios; después de la baja, el loader de /login ya no la encuentra.
        'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, SESSION_401],
        'GET /api/users': [{ status: 200, body: { users: [ANA, BETO, EVA] } }, SESSION_401],
        'POST /api/users/u-1/deactivate': { status: 200, body: { user: { ...ANA, status: 'inactivo' } } },
      }),
    );
    const { router, user } = renderApp('/usuarios');

    await deactivate(user, 'Ana Admin');

    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(await waitFor(() => buttonIn(document.body, 'Ingresar'))).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anon');
    expect(useAuthStore.getState().user).toBeNull();
  });
});
