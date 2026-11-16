/**
 * Puerto síncrono (ADR-003) de las asignaciones cliente ↔ producto (`client_products`). Trabaja con
 * ids: el dominio de clientes no depende del agregado de productos.
 */
export interface ClientProductRepository {
  /** Lanza `ProductAlreadyAssigned` si el producto ya está asignado a ese cliente (PK, FR-13). */
  assign(clientId: string, productId: string, now: Date): void;
  /** Quita la asignación; `false` si no existía (FR-15). */
  unassign(clientId: string, productId: string): boolean;
  isAssigned(clientId: string, productId: string): boolean;
  /** Ids de los productos asignados al cliente (FR-17), ordenados por id de producto. */
  listProductIdsOf(clientId: string): string[];
}
