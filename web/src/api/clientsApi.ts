import { CATALOG_STATUSES, IVA_CONDITIONS } from './catalogRules';
import { NetworkError, request } from './client';
import { isOneOf, isRecord } from './guards';
import { isProductList } from './productsApi';
import type { Client, ClientDetail, CreateClientInput, IvaCondition, UpdateClientInput } from './types';

/**
 * Clientes y sus asignaciones (`/api/clients`, FEAT-010): los tres perfiles leen; Admin y Editor
 * escriben (la autorización real es la del server). Una respuesta 2xx con una forma que no es la del
 * contrato se trata como `NetworkError`: la UI no muestra datos que no entiende.
 */
export async function listClients(): Promise<Client[]> {
  const data = await request<unknown>('/api/clients');
  if (!isRecord(data) || !Array.isArray(data.clients) || !data.clients.every(isClient)) throw new NetworkError();
  return data.clients;
}

export async function getClient(id: string): Promise<ClientDetail> {
  return detailOf(await request<unknown>(clientPath(id)));
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  return clientOf(
    await request<unknown>('/api/clients', {
      method: 'POST',
      body: {
        businessName: input.businessName,
        cuit: input.cuit,
        address: input.address,
        billingEmail: input.billingEmail,
        ivaCondition: input.ivaCondition,
      },
    }),
  );
}

export async function updateClient(id: string, input: UpdateClientInput): Promise<Client> {
  return clientOf(await request<unknown>(clientPath(id), { method: 'PATCH', body: input }));
}

export async function deactivateClient(id: string): Promise<Client> {
  return clientOf(await request<unknown>(`${clientPath(id)}/deactivate`, { method: 'POST', body: {} }));
}

export async function reactivateClient(id: string): Promise<Client> {
  return clientOf(await request<unknown>(`${clientPath(id)}/reactivate`, { method: 'POST', body: {} }));
}

/** Asigna todos o ninguno (FR-13); devuelve el detalle actualizado. */
export async function assignProducts(id: string, productIds: string[]): Promise<ClientDetail> {
  return detailOf(await request<unknown>(`${clientPath(id)}/products`, { method: 'POST', body: { productIds } }));
}

/** Desasigna por `POST …/unassign` (204, sin DELETE). */
export async function unassignProduct(id: string, productId: string): Promise<void> {
  await request<unknown>(`${clientPath(id)}/products/${encodeURIComponent(productId)}/unassign`, {
    method: 'POST',
    body: {},
  });
}

function clientPath(id: string): string {
  return `/api/clients/${encodeURIComponent(id)}`;
}

/** `{ client: Client }` o `NetworkError`. */
function clientOf(data: unknown): Client {
  if (!isRecord(data) || !isClient(data.client)) throw new NetworkError();
  return data.client;
}

/** `{ client: ClientDetail }` o `NetworkError`. */
function detailOf(data: unknown): ClientDetail {
  if (!isRecord(data) || !isClientDetail(data.client)) throw new NetworkError();
  return data.client;
}

/** Un cliente con sus productos asignados, todos con la forma del contrato. */
function isClientDetail(value: unknown): value is ClientDetail {
  return isClient(value) && isRecord(value) && isProductList(value.products);
}

function isClient(value: unknown): value is Client {
  if (!isRecord(value)) return false;
  const { id, businessName, cuit, address, billingEmail, ivaCondition, status, createdAt } = value;
  return (
    typeof id === 'string' &&
    typeof businessName === 'string' &&
    typeof cuit === 'string' &&
    typeof address === 'string' &&
    typeof billingEmail === 'string' &&
    isIvaCondition(ivaCondition) &&
    isOneOf(CATALOG_STATUSES, status) &&
    typeof createdAt === 'string'
  );
}

/** `{ code, name }` con un código de la lista de FR-04. */
function isIvaCondition(value: unknown): value is IvaCondition {
  if (!isRecord(value)) return false;
  const { code, name } = value;
  return typeof name === 'string' && IVA_CONDITIONS.some((condition) => condition.code === code);
}
