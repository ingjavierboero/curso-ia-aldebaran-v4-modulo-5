import { API_PRICE_FORMAT, CATALOG_STATUSES, CURRENCIES } from './catalogRules';
import { NetworkError, request } from './client';
import { isOneOf, isRecord } from './guards';
import type { CreateProductInput, Product, UpdateProductInput } from './types';

/**
 * Productos (`/api/products`, FEAT-010): los tres perfiles leen; Admin y Editor escriben (la
 * autorización real es la del server). Una respuesta 2xx con una forma que no es la del contrato se
 * trata como `NetworkError`: la UI no muestra datos que no entiende.
 */
export async function listProducts(): Promise<Product[]> {
  const data = await request<unknown>('/api/products');
  if (!isRecord(data) || !isProductList(data.products)) throw new NetworkError();
  return data.products;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  return productOf(
    await request<unknown>('/api/products', {
      method: 'POST',
      body: { name: input.name, price: input.price, currency: input.currency },
    }),
  );
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  return productOf(await request<unknown>(productPath(id), { method: 'PATCH', body: input }));
}

export async function deactivateProduct(id: string): Promise<Product> {
  return productOf(await request<unknown>(`${productPath(id)}/deactivate`, { method: 'POST', body: {} }));
}

export async function reactivateProduct(id: string): Promise<Product> {
  return productOf(await request<unknown>(`${productPath(id)}/reactivate`, { method: 'POST', body: {} }));
}

function productPath(id: string): string {
  return `/api/products/${encodeURIComponent(id)}`;
}

/** `{ product: Product }` o `NetworkError`. */
function productOf(data: unknown): Product {
  if (!isRecord(data) || !isProduct(data.product)) throw new NetworkError();
  return data.product;
}

/** Lista de productos con la forma del contrato (también la usa el detalle de un cliente). */
export function isProductList(value: unknown): value is Product[] {
  return Array.isArray(value) && value.every(isProduct);
}

function isProduct(value: unknown): value is Product {
  if (!isRecord(value)) return false;
  const { id, name, price, currency, status, createdAt } = value;
  return (
    typeof id === 'string' &&
    typeof name === 'string' &&
    typeof price === 'string' &&
    API_PRICE_FORMAT.test(price) &&
    isOneOf(CURRENCIES, currency) &&
    isOneOf(CATALOG_STATUSES, status) &&
    typeof createdAt === 'string'
  );
}
