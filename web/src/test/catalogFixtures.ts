/** Clientes y productos como los devuelve el server (FEAT-010, DTOs de Block 4). */

export const LOS_ANDES = {
  id: 'c-1',
  businessName: 'Los Andes SA',
  cuit: '30711111111',
  address: 'Av. Siempreviva 742',
  billingEmail: 'pagos@losandes.com',
  ivaCondition: { code: 1, name: 'IVA Responsable Inscripto' },
  status: 'activo',
  createdAt: '2026-11-16T12:00:00.000Z',
} as const;

export const BETA = {
  id: 'c-2',
  businessName: 'Beta Servicios',
  cuit: '20123456786',
  address: 'Calle Falsa 123',
  billingEmail: 'beta@beta.com',
  ivaCondition: { code: 6, name: 'Responsable Monotributo' },
  status: 'inactivo',
  createdAt: '2026-11-16T12:00:00.000Z',
} as const;

export const TURNOS = {
  id: 'p-1',
  name: 'Sistema de Turnos',
  price: '15000.50',
  currency: 'ARS',
  status: 'activo',
  createdAt: '2026-11-16T12:00:00.000Z',
} as const;

export const STOCK = {
  id: 'p-2',
  name: 'Control de Stock',
  price: '120.00',
  currency: 'USD',
  status: 'activo',
  createdAt: '2026-11-16T12:00:00.000Z',
} as const;

export const LEGADO = {
  id: 'p-3',
  name: 'Sistema Legado',
  price: '999.99',
  currency: 'ARS',
  status: 'inactivo',
  createdAt: '2026-11-16T12:00:00.000Z',
} as const;
