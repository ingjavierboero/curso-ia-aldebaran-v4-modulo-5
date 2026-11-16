import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  buttonIn,
  chooseOption,
  confirmPopconfirm,
  findDialog,
  findRow,
  queryButtonIn,
  queryDialog,
  queryRowOf,
  rowOf,
} from '../test/antdQueries';
import { BETA, LEGADO, LOS_ANDES, STOCK, TURNOS } from '../test/catalogFixtures';
import { ANA, CARLOS, EVA, HEALTH_OK, mockFetch, type RouteReply } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';

const LIST = { status: 200, body: { clients: [LOS_ANDES, BETA] } } as const;
const CONSULTA = { ...CARLOS, status: 'activo' } as const;

/** Rutas que toda visita con sesión consulta: la sesión (loader) y la salud (`HealthBanner`). */
function pageRoutes(routes: Record<string, RouteReply>, sessionUser: object = ANA): Record<string, RouteReply> {
  return {
    'GET /api/auth/session': { status: 200, body: { user: sessionUser } },
    'GET /api/health': HEALTH_OK,
    ...routes,
  };
}

/** Completa el formulario de cliente abierto. */
async function fillClientForm(
  user: UserEvent,
  dialog: HTMLElement,
  values: { businessName: string; cuit: string; address: string; billingEmail: string; ivaCondition: string },
): Promise<void> {
  await user.type(within(dialog).getByLabelText('Razón social'), values.businessName);
  await user.type(within(dialog).getByLabelText('CUIT'), values.cuit);
  await user.type(within(dialog).getByLabelText('Domicilio'), values.address);
  await user.type(within(dialog).getByLabelText('Email de facturación'), values.billingEmail);
  await user.click(within(dialog).getByLabelText('Condición frente al IVA'));
  await chooseOption(user, values.ivaCondition);
}

describe('ClientsPage', () => {
  it('test_web_clientes_listado_y_alta', async () => {
    const GAMMA = {
      ...LOS_ANDES,
      id: 'c-3',
      businessName: 'Gamma SRL',
      cuit: '27234567891',
      address: 'Ruta 3 km 10',
      billingEmail: 'admin@gamma.com',
      ivaCondition: { code: 5, name: 'Consumidor Final' },
    };
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/clients': [LIST, { status: 200, body: { clients: [BETA, GAMMA, LOS_ANDES] } }],
        'POST /api/clients': { status: 201, body: { client: GAMMA } },
      }),
    );
    const { user } = renderApp('/clientes');

    const andes = await findRow('Los Andes SA');
    expect(screen.getByText('Clientes', { selector: 'h3' })).toBeInTheDocument();
    for (const header of ['Razón social', 'CUIT', 'Email de facturación', 'Condición IVA', 'Estado', 'Acciones']) {
      expect(screen.getByText(header, { selector: 'th' })).toBeInTheDocument();
    }
    expect(within(andes).getByText('30-71111111-1')).toBeInTheDocument();
    expect(within(andes).getByText('pagos@losandes.com')).toBeInTheDocument();
    expect(within(andes).getByText('IVA Responsable Inscripto')).toBeInTheDocument();
    expect(within(andes).getByText('Activo')).toBeInTheDocument();
    // La razón social lleva al detalle del cliente.
    expect(within(andes).getByText('Los Andes SA').closest('a')).toHaveAttribute('href', '/clientes/c-1');
    const beta = rowOf('Beta Servicios');
    expect(within(beta).getByText('Inactivo')).toBeInTheDocument();
    expect(buttonIn(beta, 'Reactivar')).toHaveAttribute('aria-label', 'Reactivar a Beta Servicios');
    expect(queryButtonIn(beta, 'Dar de baja')).toBeNull();

    await user.click(buttonIn(document.body, 'Nuevo cliente'));
    const dialog = await findDialog('Nuevo cliente');

    // Sin datos no se envía nada.
    await user.click(buttonIn(dialog, 'Guardar'));
    expect(await within(dialog).findByText('Ingresá la razón social')).toBeInTheDocument();
    expect(within(dialog).getByText('Ingresá el CUIT')).toBeInTheDocument();
    expect(within(dialog).getByText('Ingresá el domicilio')).toBeInTheDocument();
    expect(within(dialog).getByText('Ingresá el email de facturación')).toBeInTheDocument();
    expect(within(dialog).getByText('Elegí la condición frente al IVA')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/clients')).toHaveLength(0);

    await fillClientForm(user, dialog, {
      businessName: 'Gamma SRL',
      cuit: '27-23456789-1',
      address: 'Ruta 3 km 10',
      billingEmail: 'admin@gamma.com',
      ivaCondition: 'Consumidor Final',
    });
    await user.click(buttonIn(dialog, 'Guardar'));

    const gamma = await findRow('Gamma SRL');
    expect(within(gamma).getByText('Consumidor Final')).toBeInTheDocument();
    expect(within(gamma).getByText('Activo')).toBeInTheDocument();
    await waitFor(() => { expect(queryDialog('Nuevo cliente')).toBeNull(); });
    // El CUIT viaja sin guiones y la condición IVA como número.
    expect(fetchMock.callsTo('POST', '/api/clients')[0]?.body).toEqual({
      businessName: 'Gamma SRL',
      cuit: '27234567891',
      address: 'Ruta 3 km 10',
      billingEmail: 'admin@gamma.com',
      ivaCondition: 5,
    });
    expect(fetchMock.callsTo('GET', '/api/clients')).toHaveLength(2);
  });

  it('test_web_alta_cliente_cuit_invalido_rechazado', async () => {
    const fetchMock = mockFetch(pageRoutes({ 'GET /api/clients': LIST }));
    const { user } = renderApp('/clientes');

    await findRow('Los Andes SA');
    await user.click(buttonIn(document.body, 'Nuevo cliente'));
    const dialog = await findDialog('Nuevo cliente');
    await fillClientForm(user, dialog, {
      businessName: 'Gamma SRL',
      cuit: '30711111118',
      address: 'Ruta 3 km 10',
      billingEmail: 'admin@gamma.com',
      ivaCondition: 'Consumidor Final',
    });
    await user.click(buttonIn(dialog, 'Guardar'));
    expect(await within(dialog).findByText('El CUIT no es válido')).toBeInTheDocument();

    // Pasa el módulo 11 pero el prefijo no es válido.
    const cuit = within(dialog).getByLabelText('CUIT');
    await user.clear(cuit);
    await user.type(cuit, '00000000000');
    await user.click(buttonIn(dialog, 'Guardar'));
    expect(await within(dialog).findByText('El CUIT no es válido')).toBeInTheDocument();

    expect(fetchMock.callsTo('POST', '/api/clients')).toHaveLength(0);
    expect(queryDialog('Nuevo cliente')).not.toBeNull();
  });

  it('test_web_cliente_duplicado_conflict_muestra_error', async () => {
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/clients': LIST,
        'POST /api/clients': { status: 409, body: { error: 'Ya existe un cliente con ese CUIT' } },
      }),
    );
    const { user } = renderApp('/clientes');

    await findRow('Los Andes SA');
    await user.click(buttonIn(document.body, 'Nuevo cliente'));
    const dialog = await findDialog('Nuevo cliente');
    await fillClientForm(user, dialog, {
      businessName: 'Otra Andes',
      cuit: '30-71111111-1',
      address: 'Otra 1',
      billingEmail: 'otra@andes.com',
      ivaCondition: 'IVA Responsable Inscripto',
    });
    await user.click(buttonIn(dialog, 'Guardar'));

    // El mensaje del server en el formulario, que sigue abierto; el listado no se recarga.
    expect(await within(dialog).findByText('Ya existe un cliente con ese CUIT')).toBeInTheDocument();
    expect(queryDialog('Nuevo cliente')).not.toBeNull();
    expect(queryRowOf('Otra Andes')).toBeNull();
    expect(fetchMock.callsTo('POST', '/api/clients')).toHaveLength(1);
    expect(fetchMock.callsTo('GET', '/api/clients')).toHaveLength(1);
  });

  it('test_web_editar_cliente', async () => {
    const EDITED = {
      ...LOS_ANDES,
      businessName: 'Los Andes Software SA',
      address: 'Nueva 100',
      billingEmail: 'cobros@losandes.com',
    };
    const fetchMock = mockFetch(
      pageRoutes(
        {
          'GET /api/clients': [LIST, { status: 200, body: { clients: [EDITED, BETA] } }],
          'PATCH /api/clients/c-1': { status: 200, body: { client: EDITED } },
          'GET /api/clients/c-1': { status: 200, body: { client: { ...EDITED, products: [] } } },
          'GET /api/products': { status: 200, body: { products: [] } },
        },
        EVA,
      ),
    );
    const { router, user } = renderApp('/clientes');

    await user.click(buttonIn(await findRow('Los Andes SA'), 'Modificar'));
    const dialog = await findDialog('Modificar cliente');
    // Precargado con los datos actuales.
    expect(within(dialog).getByLabelText('Razón social')).toHaveValue('Los Andes SA');
    expect(within(dialog).getByLabelText('CUIT')).toHaveValue('30711111111');
    expect(within(dialog).getByLabelText('Domicilio')).toHaveValue('Av. Siempreviva 742');
    expect(within(dialog).getByLabelText('Email de facturación')).toHaveValue('pagos@losandes.com');
    expect(within(dialog).getByText('IVA Responsable Inscripto')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Razón social'));
    await user.type(within(dialog).getByLabelText('Razón social'), 'Los Andes Software SA');
    await user.clear(within(dialog).getByLabelText('Domicilio'));
    await user.type(within(dialog).getByLabelText('Domicilio'), 'Nueva 100');
    await user.clear(within(dialog).getByLabelText('Email de facturación'));
    await user.type(within(dialog).getByLabelText('Email de facturación'), 'cobros@losandes.com');
    await user.click(buttonIn(dialog, 'Guardar'));

    const edited = await findRow('Los Andes Software SA');
    expect(within(edited).getByText('cobros@losandes.com')).toBeInTheDocument();
    expect(fetchMock.callsTo('PATCH', '/api/clients/c-1')[0]?.body).toEqual({
      businessName: 'Los Andes Software SA',
      cuit: '30711111111',
      address: 'Nueva 100',
      billingEmail: 'cobros@losandes.com',
      ivaCondition: 1,
    });
    expect(fetchMock.callsTo('GET', '/api/clients')).toHaveLength(2);

    // El detalle muestra los datos nuevos.
    await user.click(within(edited).getByText('Los Andes Software SA'));
    await waitFor(() => { expect(router.state.location.pathname).toBe('/clientes/c-1'); });
    expect(await screen.findByText('Los Andes Software SA', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('Nueva 100')).toBeInTheDocument();
    expect(screen.getByText('cobros@losandes.com')).toBeInTheDocument();
  });

  it('test_web_baja_reactivacion_cliente', async () => {
    const ANDES_INACTIVO = { ...LOS_ANDES, status: 'inactivo' };
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/clients': [
          LIST,
          { status: 200, body: { clients: [ANDES_INACTIVO, BETA] } },
          { status: 200, body: { clients: [LOS_ANDES, BETA] } },
        ],
        'POST /api/clients/c-1/deactivate': { status: 200, body: { client: ANDES_INACTIVO } },
        'POST /api/clients/c-1/reactivate': { status: 200, body: { client: LOS_ANDES } },
      }),
    );
    const { user } = renderApp('/clientes');

    // La baja pide confirmación: sin confirmar no se envía nada.
    await user.click(buttonIn(await findRow('Los Andes SA'), 'Dar de baja'));
    expect(await screen.findByText('¿Dar de baja a Los Andes SA?')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/clients/c-1/deactivate')).toHaveLength(0);
    await confirmPopconfirm(user);

    await waitFor(() => { expect(within(rowOf('Los Andes SA')).getByText('Inactivo')).toBeInTheDocument(); });
    expect(fetchMock.callsTo('POST', '/api/clients/c-1/deactivate')[0]?.body).toEqual({});

    await user.click(buttonIn(rowOf('Los Andes SA'), 'Reactivar'));
    await waitFor(() => { expect(within(rowOf('Los Andes SA')).getByText('Activo')).toBeInTheDocument(); });
    expect(fetchMock.callsTo('POST', '/api/clients/c-1/reactivate')[0]?.body).toEqual({});
    expect(fetchMock.callsTo('GET', '/api/clients')).toHaveLength(3);
  });

  it('test_web_consulta_sin_acciones_de_escritura', async () => {
    // Listado de clientes: se ve todo, sin acciones de escritura.
    const clientsMock = mockFetch(pageRoutes({ 'GET /api/clients': LIST }, CONSULTA));
    const clients = renderApp('/clientes');
    const andes = await findRow('Los Andes SA');
    expect(within(andes).getByText('pagos@losandes.com')).toBeInTheDocument();
    expect(screen.queryByText('Acciones', { selector: 'th' })).toBeNull();
    for (const label of ['Nuevo cliente', 'Modificar', 'Dar de baja', 'Reactivar']) {
      expect(queryButtonIn(document.body, label), label).toBeNull();
    }
    expect(clientsMock.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    clients.view.unmount();

    // Detalle: los productos asignados se ven; asignar y desasignar no, y no se piden los productos.
    const detailMock = mockFetch(
      pageRoutes({ 'GET /api/clients/c-1': { status: 200, body: { client: { ...LOS_ANDES, products: [TURNOS] } } } }, CONSULTA),
    );
    const detail = renderApp('/clientes/c-1');
    expect(await findRow('Sistema de Turnos')).toBeInTheDocument();
    for (const label of ['Asignar', 'Desasignar']) {
      expect(queryButtonIn(document.body, label), label).toBeNull();
    }
    expect(detailMock.callsTo('GET', '/api/products')).toHaveLength(0);
    detail.view.unmount();

    // Productos: listado sin acciones de escritura.
    mockFetch(pageRoutes({ 'GET /api/products': { status: 200, body: { products: [STOCK, LEGADO, TURNOS] } } }, CONSULTA));
    renderApp('/productos');
    expect(await findRow('Sistema de Turnos')).toBeInTheDocument();
    expect(screen.queryByText('Acciones', { selector: 'th' })).toBeNull();
    for (const label of ['Nuevo producto', 'Modificar', 'Desactivar', 'Reactivar']) {
      expect(queryButtonIn(document.body, label), label).toBeNull();
    }
  });

  it('test_web_respuesta_invalida_error_generico', async () => {
    // Listado de clientes con forma inesperada: error genérico y la pantalla sigue en pie.
    mockFetch(pageRoutes({ 'GET /api/clients': { status: 200, body: { clients: [{ ...LOS_ANDES, ivaCondition: 1 }] } } }));
    const clients = renderApp('/clientes');
    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(screen.getByText('Clientes', { selector: 'h3' })).toBeInTheDocument();
    expect(queryRowOf('Los Andes SA')).toBeNull();
    clients.view.unmount();

    // Detalle con un precio numérico.
    mockFetch(
      pageRoutes({
        'GET /api/clients/c-1': { status: 200, body: { client: { ...LOS_ANDES, products: [{ ...TURNOS, price: 15000.5 }] } } },
        'GET /api/products': { status: 200, body: { products: [TURNOS] } },
      }),
    );
    const detail = renderApp('/clientes/c-1');
    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(queryRowOf('Sistema de Turnos')).toBeNull();
    detail.view.unmount();

    // Productos con una moneda desconocida.
    mockFetch(pageRoutes({ 'GET /api/products': { status: 200, body: { products: [{ ...TURNOS, currency: 'EUR' }] } } }));
    renderApp('/productos');
    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(screen.getByText('Productos', { selector: 'h3' })).toBeInTheDocument();
    expect(queryRowOf('Sistema de Turnos')).toBeNull();
  });
});
