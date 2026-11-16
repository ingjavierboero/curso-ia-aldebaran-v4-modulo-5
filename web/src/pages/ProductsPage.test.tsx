import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  buttonIn,
  confirmPopconfirm,
  findDialog,
  findRow,
  queryButtonIn,
  queryDialog,
  queryRowOf,
  rowOf,
} from '../test/antdQueries';
import { useAuthStore } from '../store/authStore';
import { LEGADO, STOCK, TURNOS } from '../test/catalogFixtures';
import { ANA, EVA, HEALTH_OK, mockFetch, type RouteReply } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';

const LIST = { status: 200, body: { products: [STOCK, LEGADO, TURNOS] } } as const;

function pageRoutes(routes: Record<string, RouteReply>, sessionUser: object = ANA): Record<string, RouteReply> {
  return {
    'GET /api/auth/session': { status: 200, body: { user: sessionUser } },
    'GET /api/health': HEALTH_OK,
    ...routes,
  };
}

const PRICE_ERROR = 'Ingresá un precio mayor a cero, con hasta 9 enteros y 2 decimales';

describe('ProductsPage', () => {
  it('test_web_productos_listado_precio_formateado', async () => {
    const FACTURADOR = { ...TURNOS, id: 'p-4', name: 'Facturador' };
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/products': [LIST, { status: 200, body: { products: [STOCK, FACTURADOR, LEGADO, TURNOS] } }],
        'POST /api/products': { status: 201, body: { product: FACTURADOR } },
      }),
    );
    const { user } = renderApp('/productos');

    const turnos = await findRow('Sistema de Turnos');
    expect(screen.getByText('Productos', { selector: 'h3' })).toBeInTheDocument();
    for (const header of ['Nombre', 'Precio', 'Moneda', 'Estado', 'Acciones']) {
      expect(screen.getByText(header, { selector: 'th' })).toBeInTheDocument();
    }
    expect(within(turnos).getByText('$ 15.000,50')).toBeInTheDocument();
    expect(within(turnos).getByText('ARS')).toBeInTheDocument();
    expect(within(turnos).getByText('Activo')).toBeInTheDocument();
    const stock = rowOf('Control de Stock');
    expect(within(stock).getByText('US$ 120,00')).toBeInTheDocument();
    expect(within(stock).getByText('USD')).toBeInTheDocument();
    const legado = rowOf('Sistema Legado');
    expect(within(legado).getByText('Inactivo')).toBeInTheDocument();
    expect(buttonIn(legado, 'Reactivar')).toHaveAttribute('aria-label', 'Reactivar Sistema Legado');
    expect(queryButtonIn(legado, 'Desactivar')).toBeNull();

    // Alta: el precio se escribe con coma decimal y viaja como texto con punto.
    await user.click(buttonIn(document.body, 'Nuevo producto'));
    const dialog = await findDialog('Nuevo producto');
    await user.click(buttonIn(dialog, 'Guardar'));
    expect(await within(dialog).findByText('Ingresá el nombre')).toBeInTheDocument();
    expect(within(dialog).getByText('Ingresá el precio')).toBeInTheDocument();
    expect(within(dialog).getByText('Elegí la moneda')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Nombre'), 'Facturador');
    await user.type(within(dialog).getByLabelText('Precio'), '15000,50');
    await user.click(within(dialog).getByLabelText('Pesos (ARS)'));
    await user.click(buttonIn(dialog, 'Guardar'));

    expect(await findRow('Facturador')).toBeInTheDocument();
    await waitFor(() => { expect(queryDialog('Nuevo producto')).toBeNull(); });
    expect(fetchMock.callsTo('POST', '/api/products')[0]?.body).toEqual({
      name: 'Facturador',
      price: '15000.50',
      currency: 'ARS',
    });
    expect(fetchMock.callsTo('GET', '/api/products')).toHaveLength(2);
  });

  it('test_web_precio_invalido_rechazado', async () => {
    const CENTAVO = { ...TURNOS, id: 'p-5', name: 'Centavo', price: '0.01' };
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/products': [LIST, { status: 200, body: { products: [CENTAVO, STOCK, LEGADO, TURNOS] } }],
        'POST /api/products': { status: 201, body: { product: CENTAVO } },
      }),
    );
    const { user } = renderApp('/productos');

    await findRow('Sistema de Turnos');
    await user.click(buttonIn(document.body, 'Nuevo producto'));
    const dialog = await findDialog('Nuevo producto');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Centavo');
    await user.click(within(dialog).getByLabelText('Pesos (ARS)'));
    const price = within(dialog).getByLabelText('Precio');

    for (const invalid of ['0', '1,234']) {
      await user.clear(price);
      await user.type(price, invalid);
      await user.click(buttonIn(dialog, 'Guardar'));
      expect(await within(dialog).findByText(PRICE_ERROR)).toBeInTheDocument();
    }
    expect(fetchMock.callsTo('POST', '/api/products')).toHaveLength(0);

    // Contraste: el mínimo válido sí se envía.
    await user.clear(price);
    await user.type(price, '0,01');
    await user.click(buttonIn(dialog, 'Guardar'));
    expect(await findRow('Centavo')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/products')[0]?.body).toEqual({ name: 'Centavo', price: '0.01', currency: 'ARS' });
  });

  it('test_web_editar_producto_y_desactivar', async () => {
    const EN_DOLARES = { ...TURNOS, name: 'Turnos Online', price: '120.00', currency: 'USD' };
    const INACTIVO = { ...EN_DOLARES, status: 'inactivo' };
    const fetchMock = mockFetch(
      pageRoutes(
        {
          'GET /api/products': [
            LIST,
            { status: 200, body: { products: [STOCK, LEGADO, EN_DOLARES] } },
            { status: 200, body: { products: [STOCK, LEGADO, INACTIVO] } },
            { status: 200, body: { products: [STOCK, LEGADO, EN_DOLARES] } },
          ],
          'PATCH /api/products/p-1': { status: 200, body: { product: EN_DOLARES } },
          'POST /api/products/p-1/deactivate': { status: 200, body: { product: INACTIVO } },
          'POST /api/products/p-1/reactivate': { status: 200, body: { product: EN_DOLARES } },
        },
        EVA,
      ),
    );
    const { user } = renderApp('/productos');

    await user.click(buttonIn(await findRow('Sistema de Turnos'), 'Modificar'));
    const dialog = await findDialog('Modificar producto');
    // Precargado, con el precio en formato es-AR.
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Sistema de Turnos');
    expect(within(dialog).getByLabelText('Precio')).toHaveValue('15000,50');
    expect(within(dialog).getByLabelText('Pesos (ARS)')).toBeChecked();

    await user.clear(within(dialog).getByLabelText('Nombre'));
    await user.type(within(dialog).getByLabelText('Nombre'), 'Turnos Online');
    await user.clear(within(dialog).getByLabelText('Precio'));
    await user.type(within(dialog).getByLabelText('Precio'), '120');
    await user.click(within(dialog).getByLabelText('Dólares (USD)'));
    await user.click(buttonIn(dialog, 'Guardar'));

    const edited = await findRow('Turnos Online');
    expect(within(edited).getByText('US$ 120,00')).toBeInTheDocument();
    expect(within(edited).getByText('USD')).toBeInTheDocument();
    expect(queryRowOf('Sistema de Turnos')).toBeNull();
    expect(fetchMock.callsTo('PATCH', '/api/products/p-1')[0]?.body).toEqual({
      name: 'Turnos Online',
      price: '120',
      currency: 'USD',
    });

    // Desactivar pide confirmación.
    await user.click(buttonIn(rowOf('Turnos Online'), 'Desactivar'));
    expect(await screen.findByText('¿Desactivar Turnos Online?')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/products/p-1/deactivate')).toHaveLength(0);
    await confirmPopconfirm(user);
    await waitFor(() => { expect(within(rowOf('Turnos Online')).getByText('Inactivo')).toBeInTheDocument(); });
    expect(fetchMock.callsTo('POST', '/api/products/p-1/deactivate')[0]?.body).toEqual({});

    await user.click(buttonIn(rowOf('Turnos Online'), 'Reactivar'));
    await waitFor(() => { expect(within(rowOf('Turnos Online')).getByText('Activo')).toBeInTheDocument(); });
    expect(fetchMock.callsTo('POST', '/api/products/p-1/reactivate')[0]?.body).toEqual({});
    expect(fetchMock.callsTo('GET', '/api/products')).toHaveLength(4);
  });

  it('modificar el precio a 0 no llama a la API', async () => {
    const fetchMock = mockFetch(pageRoutes({ 'GET /api/products': LIST }));
    const { user } = renderApp('/productos');

    await user.click(buttonIn(await findRow('Sistema de Turnos'), 'Modificar'));
    const dialog = await findDialog('Modificar producto');
    const price = within(dialog).getByLabelText('Precio');
    await user.clear(price);
    await user.type(price, '0');
    await user.click(buttonIn(dialog, 'Guardar'));

    expect(await within(dialog).findByText(PRICE_ERROR)).toBeInTheDocument();
    expect(fetchMock.callsTo('PATCH', '/api/products/p-1')).toHaveLength(0);
    expect(queryDialog('Modificar producto')).not.toBeNull();
  });

  it('un 403 al escribir muestra el mensaje y refresca la sesión: sin permiso, desaparecen las acciones', async () => {
    const EVA_CONSULTA = { ...EVA, role: 'consulta' };
    const fetchMock = mockFetch(
      pageRoutes({
        // El loader la ve Editor; mientras la pantalla está abierta, un Admin la pasa a Consulta.
        'GET /api/auth/session': [{ status: 200, body: { user: EVA } }, { status: 200, body: { user: EVA_CONSULTA } }],
        'GET /api/products': LIST,
        'POST /api/products/p-1/deactivate': { status: 403, body: { error: 'No tenés permiso para realizar esta acción' } },
      }),
    );
    const { user } = renderApp('/productos');

    await user.click(buttonIn(await findRow('Sistema de Turnos'), 'Desactivar'));
    await confirmPopconfirm(user);

    expect(await screen.findByText('No tenés permiso para realizar esta acción')).toBeInTheDocument();
    await waitFor(() => { expect(useAuthStore.getState().user?.role).toBe('consulta'); });
    await waitFor(() => { expect(queryButtonIn(document.body, 'Nuevo producto')).toBeNull(); });
    expect(queryButtonIn(rowOf('Sistema de Turnos'), 'Modificar')).toBeNull();
    expect(fetchMock.callsTo('GET', '/api/auth/session').length).toBeGreaterThanOrEqual(2);
  });

  it('un nombre duplicado muestra el mensaje del server en el formulario', async () => {
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/products': LIST,
        'POST /api/products': { status: 409, body: { error: 'Ya existe un producto con ese nombre' } },
      }),
    );
    const { user } = renderApp('/productos');

    await findRow('Sistema de Turnos');
    await user.click(buttonIn(document.body, 'Nuevo producto'));
    const dialog = await findDialog('Nuevo producto');
    await user.type(within(dialog).getByLabelText('Nombre'), 'sistema de turnos');
    await user.type(within(dialog).getByLabelText('Precio'), '100');
    await user.click(within(dialog).getByLabelText('Pesos (ARS)'));
    await user.click(buttonIn(dialog, 'Guardar'));

    expect(await within(dialog).findByText('Ya existe un producto con ese nombre')).toBeInTheDocument();
    expect(queryDialog('Nuevo producto')).not.toBeNull();
    expect(fetchMock.callsTo('GET', '/api/products')).toHaveLength(1);
  });
});
