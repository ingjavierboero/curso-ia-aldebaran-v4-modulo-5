import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { chooseOption, queryButtonIn } from '../test/antdQueries';
import { ANA, CARLOS, EVA, HEALTH_OK, mockFetch, type RouteReply } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';
import { EMPTY_SETTINGS, FULL_SETTINGS, WITHOUT_IIBB, WITHOUT_POS_AND_START } from '../test/settingsFixtures';

const PATH = '/configuracion';
const HOUR_ERROR = 'Ingresá una hora entre 00:00 y 23:59, en formato HH:MM';
const POS_ERROR = 'Ingresá un número entero entre 1 y 99999';
const DATE_ERROR = 'Ingresá una fecha existente, desde el 01/01/1900 y no posterior a hoy';
const NO_INVOICES = 'no se pueden generar facturas';

const REQUIRED_LABELS = [
  'Razón social',
  'Domicilio comercial',
  'Condición frente al IVA',
  'Número de ingresos brutos',
  'Fecha de inicio de actividades',
  'Punto de venta',
];
const OPTIONAL_LABELS = ['Hora de facturación', 'Nombre de fantasía'];

function pageRoutes(routes: Record<string, RouteReply>, sessionUser: object = ANA): Record<string, RouteReply> {
  return {
    'GET /api/auth/session': { status: 200, body: { user: sessionUser } },
    'GET /api/health': HEALTH_OK,
    ...routes,
  };
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label);
}

async function findField(label: string): Promise<HTMLInputElement> {
  return screen.findByLabelText(label);
}

/** El contenedor (`Form.Item`) del campo con esa etiqueta. */
function itemOf(label: string): HTMLElement {
  const item = field(label).closest<HTMLElement>('.ant-form-item');
  if (!item) throw new Error(`No hay un Form.Item para "${label}"`);
  return item;
}

function saveButton(): HTMLButtonElement | null {
  return queryButtonIn(document.body, 'Guardar');
}

async function replace(user: UserEvent, label: string, value: string): Promise<void> {
  const input = field(label);
  await user.clear(input);
  if (value !== '') await user.type(input, value);
}

/**
 * Escribe la fecha en el `DatePicker` (`DD/MM/YYYY`) y la confirma saliendo del campo. Con Enter no:
 * en un formulario, Enter envía el formulario (como en el navegador).
 */
async function pickDate(user: UserEvent, value: string): Promise<void> {
  const input = field('Fecha de inicio de actividades');
  await user.click(input);
  await user.clear(input);
  await user.type(input, value);
  await user.tab();
  await waitFor(() => { expect(field('Fecha de inicio de actividades')).toHaveValue(value); });
}

async function chooseIva(user: UserEvent, name: string): Promise<void> {
  await user.click(field('Condición frente al IVA'));
  await chooseOption(user, name);
}

async function save(user: UserEvent): Promise<void> {
  const button = saveButton();
  if (!button) throw new Error('No hay un botón "Guardar"');
  await user.click(button);
}

function missingAlert(): HTMLElement | null {
  return screen.queryAllByRole('alert').find((el) => el.textContent.includes(NO_INVOICES)) ?? null;
}

describe('SettingsPage', () => {
  it('test_web_configuracion_muestra_valores_y_obligatorios', async () => {
    // AC-01: un sistema recién instalado muestra 11:00 y lo demás vacío.
    mockFetch(pageRoutes({ 'GET /api/settings/billing': { status: 200, body: EMPTY_SETTINGS } }));
    const fresh = renderApp(PATH);

    expect(await screen.findByText('Configuración', { selector: 'h3' })).toBeInTheDocument();
    expect(await findField('Hora de facturación')).toHaveValue('11:00');
    for (const label of ['Punto de venta', 'Razón social', 'Domicilio comercial', 'Número de ingresos brutos', 'Nombre de fantasía']) {
      expect(field(label), label).toHaveValue('');
    }
    expect(field('Fecha de inicio de actividades')).toHaveValue('');
    fresh.view.unmount();

    // AC-12: con el punto de venta y la fecha de inicio faltantes, se marcan los 6 obligatorios y el aviso
    // nombra solo esos dos.
    mockFetch(pageRoutes({ 'GET /api/settings/billing': { status: 200, body: WITHOUT_POS_AND_START } }));
    renderApp(PATH);

    expect(await findField('Razón social')).toHaveValue('Aldebaran SRL');
    expect(field('Domicilio comercial')).toHaveValue('Av. Corrientes 1234, CABA');
    expect(field('Número de ingresos brutos')).toHaveValue('CM 901-123456-7');
    expect(field('Hora de facturación')).toHaveValue('11:00');
    expect(within(itemOf('Condición frente al IVA')).getByText('Responsable Monotributo')).toBeInTheDocument();
    for (const label of REQUIRED_LABELS) expect(field(label), label).toHaveAttribute('aria-required', 'true');
    for (const label of OPTIONAL_LABELS) expect(field(label), label).not.toHaveAttribute('aria-required', 'true');

    const alert = missingAlert();
    expect(alert).not.toBeNull();
    expect(alert).toHaveTextContent('fecha de inicio de actividades y punto de venta');
    expect(alert).not.toHaveTextContent('razón social');
  });

  it('test_web_admin_guarda_configuracion', async () => {
    const changedHour = { ...FULL_SETTINGS, billingHour: '10:30' };
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/settings/billing': { status: 200, body: EMPTY_SETTINGS },
        'PATCH /api/settings/billing': [
          { status: 200, body: FULL_SETTINGS },
          { status: 200, body: changedHour },
        ],
      }),
    );
    const { user } = renderApp(PATH);

    await findField('Hora de facturación');
    await replace(user, 'Hora de facturación', '23:59');
    await replace(user, 'Punto de venta', '5');
    await replace(user, 'Razón social', 'Aldebaran SRL');
    await replace(user, 'Domicilio comercial', 'Av. Corrientes 1234, CABA');
    await chooseIva(user, 'Responsable Monotributo');
    await replace(user, 'Número de ingresos brutos', '  CM 901-123456-7  ');
    await pickDate(user, '29/02/2024');
    await replace(user, 'Nombre de fantasía', 'Aldebaran');
    await save(user);

    expect(await screen.findByText('Configuración guardada')).toBeInTheDocument();
    expect(fetchMock.callsTo('PATCH', '/api/settings/billing')[0]?.body).toEqual({
      billingHour: '23:59',
      pointOfSale: 5,
      issuer: {
        legalName: 'Aldebaran SRL',
        address: 'Av. Corrientes 1234, CABA',
        ivaCondition: 6,
        iibb: 'CM 901-123456-7',
        activityStartDate: '2024-02-29',
        tradeName: 'Aldebaran',
      },
    });
    // La pantalla muestra lo que devolvió el server.
    expect(field('Número de ingresos brutos')).toHaveValue('CM 901-123456-7');
    expect(field('Fecha de inicio de actividades')).toHaveValue('29/02/2024');
    expect(field('Punto de venta')).toHaveValue('5');
    expect(missingAlert()).toBeNull();
    // La respuesta trae `updatedAt` (2026-11-16T14:00Z, 11:00 en Argentina), pero no se muestra.
    expect(screen.queryByText(/16\/11\/2026|2026-11-16|16 de noviembre/)).not.toBeInTheDocument();

    // Un segundo guardado envía solo lo que cambió.
    await replace(user, 'Hora de facturación', '10:30');
    await save(user);
    await waitFor(() => { expect(fetchMock.callsTo('PATCH', '/api/settings/billing')).toHaveLength(2); });
    expect(fetchMock.callsTo('PATCH', '/api/settings/billing')[1]?.body).toEqual({ billingHour: '10:30' });
    await waitFor(() => { expect(field('Hora de facturación')).toHaveValue('10:30'); });
    expect(fetchMock.callsTo('GET', '/api/settings/billing')).toHaveLength(1);
  });

  it('test_web_hora_invalida_rechazada', async () => {
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/settings/billing': { status: 200, body: FULL_SETTINGS },
        'PATCH /api/settings/billing': { status: 200, body: FULL_SETTINGS },
      }),
    );
    const { user } = renderApp(PATH);

    await findField('Hora de facturación');
    for (const hour of ['24:00', '23:60', '9:00']) {
      await replace(user, 'Hora de facturación', hour);
      await save(user);
      expect(await screen.findByText(HOUR_ERROR), hour).toBeInTheDocument();
    }
    expect(fetchMock.callsTo('PATCH', '/api/settings/billing')).toHaveLength(0);
  });

  it('un punto de venta inválido se marca sin llamar a la API (AC-05)', async () => {
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/settings/billing': { status: 200, body: FULL_SETTINGS },
        'PATCH /api/settings/billing': { status: 200, body: FULL_SETTINGS },
      }),
    );
    const { user } = renderApp(PATH);

    await findField('Punto de venta');
    for (const pos of ['0', '100000', '2,5']) {
      await replace(user, 'Punto de venta', pos);
      await save(user);
      expect(await screen.findByText(POS_ERROR), pos).toBeInTheDocument();
    }
    // Dejar vacío un dato ya guardado tampoco se envía.
    await replace(user, 'Punto de venta', '');
    await save(user);
    expect(await screen.findByText('Este dato ya está guardado: no se puede dejar vacío')).toBeInTheDocument();
    expect(fetchMock.callsTo('PATCH', '/api/settings/billing')).toHaveLength(0);
  });

  it('test_web_aviso_faltantes_y_desaparece', async () => {
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/settings/billing': { status: 200, body: EMPTY_SETTINGS },
        'PATCH /api/settings/billing': [
          { status: 200, body: WITHOUT_IIBB },
          { status: 200, body: FULL_SETTINGS },
        ],
      }),
    );
    const { user } = renderApp(PATH);

    await findField('Razón social');
    expect(missingAlert()).toHaveTextContent('razón social');

    // AC-10: se guarda sin el número de ingresos brutos y el aviso pasa a nombrar solo ese dato.
    await replace(user, 'Punto de venta', '5');
    await replace(user, 'Razón social', 'Aldebaran SRL');
    await replace(user, 'Domicilio comercial', 'Av. Corrientes 1234, CABA');
    await chooseIva(user, 'Responsable Monotributo');
    await pickDate(user, '29/02/2024');
    await save(user);

    await waitFor(() => { expect(missingAlert()).not.toHaveTextContent('razón social'); });
    expect(missingAlert()).toHaveTextContent('número de ingresos brutos');
    expect(fetchMock.callsTo('PATCH', '/api/settings/billing')[0]?.body).not.toHaveProperty('issuer.iibb');

    // AC-11: al completar el último obligatorio, el aviso desaparece.
    await replace(user, 'Número de ingresos brutos', 'CM 901-123456-7');
    await save(user);

    await waitFor(() => { expect(missingAlert()).toBeNull(); });
    expect(fetchMock.callsTo('PATCH', '/api/settings/billing')[1]?.body).toEqual({ issuer: { iibb: 'CM 901-123456-7' } });
  });

  it('test_web_valor_rechazado_por_server_muestra_error', async () => {
    const SERVER_ERROR =
      'La condición frente al IVA de la empresa emisora debe ser IVA Sujeto Exento, Responsable Monotributo, ' +
      'Monotributista Social o Monotributo Trabajador Independiente Promovido';
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/settings/billing': { status: 200, body: FULL_SETTINGS },
        'PATCH /api/settings/billing': { status: 400, body: { error: SERVER_ERROR } },
      }),
    );
    const { user } = renderApp(PATH);

    await findField('Razón social');
    await chooseIva(user, 'IVA Sujeto Exento');
    await replace(user, 'Razón social', 'Otra SRL');
    await save(user);

    expect(await screen.findByText(SERVER_ERROR)).toBeInTheDocument();
    expect(fetchMock.callsTo('PATCH', '/api/settings/billing')).toHaveLength(1);
    // El formulario conserva lo que escribió el Admin para que lo corrija; no se marcó como guardado.
    expect(field('Razón social')).toHaveValue('Otra SRL');
    expect(screen.queryByText('Configuración guardada')).not.toBeInTheDocument();
    expect(saveButton()).not.toBeNull();
  });

  it('test_web_editor_consulta_solo_lectura', async () => {
    for (const visitor of [EVA, { ...CARLOS, status: 'activo' as const }]) {
      const fetchMock = mockFetch(pageRoutes({ 'GET /api/settings/billing': { status: 200, body: FULL_SETTINGS } }, visitor));
      const { view } = renderApp(PATH);

      expect(await findField('Razón social'), visitor.role).toHaveValue('Aldebaran SRL');
      for (const label of [...REQUIRED_LABELS, ...OPTIONAL_LABELS]) {
        expect(field(label), `${visitor.role} ${label}`).toBeDisabled();
      }
      expect(field('Hora de facturación')).toHaveValue('23:59');
      expect(saveButton(), visitor.role).toBeNull();
      expect(fetchMock.callsTo('PATCH', '/api/settings/billing')).toHaveLength(0);
      view.unmount();
    }

    // Contraste: un Admin edita y tiene el botón.
    mockFetch(pageRoutes({ 'GET /api/settings/billing': { status: 200, body: FULL_SETTINGS } }));
    renderApp(PATH);
    expect(await findField('Razón social')).toBeEnabled();
    expect(saveButton()).not.toBeNull();
  });

  it('test_web_guardado_forbidden_muestra_error', async () => {
    const FORBIDDEN = 'No tenés permiso para realizar esta acción';
    const fetchMock = mockFetch(
      pageRoutes({
        // El loader la ve Admin; con la pantalla abierta, otro Admin lo pasa a Editor.
        'GET /api/auth/session': [{ status: 200, body: { user: ANA } }, { status: 200, body: { user: { ...ANA, role: 'editor' } } }],
        'GET /api/settings/billing': { status: 200, body: FULL_SETTINGS },
        'PATCH /api/settings/billing': { status: 403, body: { error: FORBIDDEN } },
      }),
    );
    const { user } = renderApp(PATH);

    await findField('Hora de facturación');
    await replace(user, 'Hora de facturación', '10:00');
    await save(user);

    expect(await screen.findByText(FORBIDDEN)).toBeInTheDocument();
    await waitFor(() => { expect(useAuthStore.getState().user?.role).toBe('editor'); });
    await waitFor(() => { expect(saveButton()).toBeNull(); });
    expect(field('Hora de facturación')).toBeDisabled();
    // El valor que no se guardó no queda en pantalla: vuelve el que tiene el server.
    expect(field('Hora de facturación')).toHaveValue('23:59');
    expect(fetchMock.callsTo('GET', '/api/auth/session').length).toBeGreaterThanOrEqual(2);
  });

  it('una fecha de inicio futura se marca sin llamar a la API', async () => {
    // El `DatePicker` ya no acepta fechas anteriores a 1900 ni posteriores a hoy, así que la regla del
    // formulario solo se alcanza si "hoy" cambia entre elegir la fecha y guardar: se elige la de hoy y
    // se atrasa el reloj un día (solo `Date`; los timers siguen siendo reales).
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-17T12:00:00-03:00'));
      const fetchMock = mockFetch(
        pageRoutes({
          'GET /api/settings/billing': { status: 200, body: FULL_SETTINGS },
          'PATCH /api/settings/billing': { status: 200, body: FULL_SETTINGS },
        }),
      );
      const { user } = renderApp(PATH);

      await findField('Fecha de inicio de actividades');
      await pickDate(user, '17/11/2026');
      vi.setSystemTime(new Date('2026-11-16T12:00:00-03:00'));
      await save(user);

      expect(await screen.findByText(DATE_ERROR)).toBeInTheDocument();
      expect(fetchMock.callsTo('PATCH', '/api/settings/billing')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un número de ingresos brutos de más de 50 caracteres se marca sin llamar a la API', async () => {
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/settings/billing': { status: 200, body: FULL_SETTINGS },
        'PATCH /api/settings/billing': { status: 200, body: FULL_SETTINGS },
      }),
    );
    const { user } = renderApp(PATH);

    await findField('Número de ingresos brutos');
    await replace(user, 'Número de ingresos brutos', 'x'.repeat(51));
    await save(user);

    expect(await screen.findByText('Admite hasta 50 caracteres')).toBeInTheDocument();
    expect(fetchMock.callsTo('PATCH', '/api/settings/billing')).toHaveLength(0);
  });

  it('guardar sin cambios avisa y no llama a la API', async () => {
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/settings/billing': { status: 200, body: FULL_SETTINGS },
        'PATCH /api/settings/billing': { status: 200, body: FULL_SETTINGS },
      }),
    );
    const { user } = renderApp(PATH);

    await findField('Hora de facturación');
    await save(user);

    expect(await screen.findByText('No hay cambios para guardar')).toBeInTheDocument();
    expect(screen.queryByText('Configuración guardada')).not.toBeInTheDocument();
    expect(fetchMock.callsTo('PATCH', '/api/settings/billing')).toHaveLength(0);
  });

  it('test_web_respuesta_invalida_error_generico', async () => {
    // La lectura con forma inesperada (con envoltorio): error genérico y la pantalla sigue en pie.
    mockFetch(pageRoutes({ 'GET /api/settings/billing': { status: 200, body: { settings: FULL_SETTINGS } } }));
    const read = renderApp(PATH);

    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(screen.getByText('Configuración', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Razón social')).not.toBeInTheDocument();
    expect(saveButton()).toBeNull();
    read.view.unmount();

    // El guardado con forma inesperada: error genérico y el formulario sigue con lo escrito.
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/settings/billing': { status: 200, body: FULL_SETTINGS },
        'PATCH /api/settings/billing': { status: 200, body: { ...FULL_SETTINGS, pointOfSale: '5' } },
      }),
    );
    const { user } = renderApp(PATH);
    await findField('Hora de facturación');
    await replace(user, 'Hora de facturación', '10:00');
    await save(user);

    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(field('Hora de facturación')).toHaveValue('10:00');
    expect(screen.queryByText('Configuración guardada')).not.toBeInTheDocument();
    expect(fetchMock.callsTo('PATCH', '/api/settings/billing')).toHaveLength(1);
  });
});
