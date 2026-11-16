import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  buttonIn,
  chooseOption,
  confirmPopconfirm,
  findRow,
  queryButtonIn,
  queryRowOf,
  rowOf,
  visibleOptions,
} from '../test/antdQueries';
import { BETA, LEGADO, STOCK, TURNOS } from '../test/catalogFixtures';
import { ANA, HEALTH_OK, mockFetch, type RouteReply } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';

const PRODUCTS = { status: 200, body: { products: [STOCK, LEGADO, TURNOS] } } as const;
const WEB = { ...STOCK, id: 'p-6', name: 'Facturación Web' } as const;

function pageRoutes(routes: Record<string, RouteReply>): Record<string, RouteReply> {
  return {
    'GET /api/auth/session': { status: 200, body: { user: ANA } },
    'GET /api/health': HEALTH_OK,
    ...routes,
  };
}

/** El `Select` de productos para asignar. */
function assignSelect(): HTMLElement {
  return screen.getByLabelText('Productos para asignar');
}

describe('ClientDetailPage', () => {
  it('test_web_detalle_asignar_y_desasignar', async () => {
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/clients/c-2': [
          { status: 200, body: { client: { ...BETA, products: [TURNOS] } } },
          { status: 200, body: { client: { ...BETA, products: [STOCK] } } },
        ],
        'GET /api/products': PRODUCTS,
        'POST /api/clients/c-2/products': { status: 200, body: { client: { ...BETA, products: [STOCK, TURNOS] } } },
        'POST /api/clients/c-2/products/p-1/unassign': { status: 204 },
      }),
    );
    const { user } = renderApp('/clientes/c-2');

    // Datos del cliente (Inactivo: igual se le pueden asignar productos) y sus productos asignados.
    const turnos = await findRow('Sistema de Turnos');
    expect(screen.getByText('Beta Servicios', { selector: 'h3' })).toBeInTheDocument();
    for (const text of ['20-12345678-6', 'Calle Falsa 123', 'beta@beta.com', 'Responsable Monotributo', 'Inactivo']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    // Fecha de alta (FR-17), en formato es-AR.
    expect(screen.getByText('Fecha de alta')).toBeInTheDocument();
    expect(screen.getByText('16/11/2026')).toBeInTheDocument();
    expect(within(turnos).getByText('$ 15.000,50')).toBeInTheDocument();
    expect(screen.getByText('Volver a clientes').closest('a')).toHaveAttribute('href', '/clientes');

    // Solo se ofrecen los productos Activos que no están asignados.
    await user.click(assignSelect());
    await waitFor(() => { expect(visibleOptions()).toEqual(['Control de Stock']); });
    await chooseOption(user, 'Control de Stock');
    await user.click(buttonIn(document.body, 'Asignar'));

    expect(await findRow('Control de Stock')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/clients/c-2/products')[0]?.body).toEqual({ productIds: ['p-2'] });

    // Desasignar pide confirmación y recarga el detalle.
    await user.click(buttonIn(rowOf('Sistema de Turnos'), 'Desasignar'));
    expect(await screen.findByText('¿Desasignar Sistema de Turnos?')).toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/clients/c-2/products/p-1/unassign')).toHaveLength(0);
    await confirmPopconfirm(user);

    await waitFor(() => { expect(queryRowOf('Sistema de Turnos')).toBeNull(); });
    expect(queryRowOf('Control de Stock')).not.toBeNull();
    expect(fetchMock.callsTo('POST', '/api/clients/c-2/products/p-1/unassign')[0]?.body).toEqual({});
    expect(fetchMock.callsTo('GET', '/api/clients/c-2')).toHaveLength(2);
  });

  it('un 409 al asignar muestra el mensaje del server, no cambia los asignados y recarga los productos', async () => {
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/clients/c-2': { status: 200, body: { client: { ...BETA, products: [TURNOS] } } },
        // Mientras la pantalla estaba abierta, otro usuario desactivó "Control de Stock".
        // y creó "Facturación Web".
        'GET /api/products': [
          PRODUCTS,
          { status: 200, body: { products: [{ ...STOCK, status: 'inactivo' }, WEB, LEGADO, TURNOS] } },
        ],
        'POST /api/clients/c-2/products': { status: 409, body: { error: 'El producto está Inactivo' } },
      }),
    );
    const { user } = renderApp('/clientes/c-2');

    await findRow('Sistema de Turnos');
    await user.click(assignSelect());
    await chooseOption(user, 'Control de Stock');
    await user.click(buttonIn(document.body, 'Asignar'));

    expect(await screen.findByText('El producto está Inactivo')).toBeInTheDocument();
    expect(queryRowOf('Control de Stock')).toBeNull();
    expect(fetchMock.callsTo('POST', '/api/clients/c-2/products')).toHaveLength(1);

    // La lista de productos se recargó: la opción vieja ya no se ofrece y aparece la nueva.
    await waitFor(() => { expect(fetchMock.callsTo('GET', '/api/products')).toHaveLength(2); });
    await user.click(assignSelect());
    await waitFor(() => { expect(visibleOptions()).toEqual(['Facturación Web']); });
  });

  it('sin productos elegidos, "Asignar" no llama a la API', async () => {
    const fetchMock = mockFetch(
      pageRoutes({
        'GET /api/clients/c-2': { status: 200, body: { client: { ...BETA, products: [] } } },
        'GET /api/products': PRODUCTS,
      }),
    );
    renderApp('/clientes/c-2');

    await screen.findByText('Beta Servicios', { selector: 'h3' });
    await waitFor(() => { expect(buttonIn(document.body, 'Asignar')).toBeDisabled(); });
    expect(fetchMock.callsTo('POST', '/api/clients/c-2/products')).toHaveLength(0);
  });

  it('un cliente inexistente muestra el mensaje del server', async () => {
    mockFetch(
      pageRoutes({
        'GET /api/clients/c-9': { status: 404, body: { error: 'No existe el cliente' } },
        'GET /api/products': PRODUCTS,
      }),
    );
    renderApp('/clientes/c-9');

    expect(await screen.findByText('No existe el cliente')).toBeInTheDocument();
    expect(queryButtonIn(document.body, 'Asignar')).toBeNull();
  });
});
