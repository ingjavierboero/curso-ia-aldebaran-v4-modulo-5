import type { ClientProductRepository } from '../../src/domain/client/ClientProductRepository.js';
import { ProductAlreadyAssigned } from '../../src/domain/client/errors.js';

interface Assignment {
  clientId: string;
  productId: string;
  createdAt: Date;
}

const keyOf = (clientId: string, productId: string) => JSON.stringify([clientId, productId]);

/**
 * Doble en memoria con la misma regla que la PK compuesta de `client_products`. No conoce a los
 * clientes ni a los productos: las FK solo las prueba la versión Drizzle.
 */
export class InMemoryClientProductRepository implements ClientProductRepository {
  private readonly rows = new Map<string, Assignment>();

  assign(clientId: string, productId: string, now: Date): void {
    const key = keyOf(clientId, productId);
    if (this.rows.has(key)) throw new ProductAlreadyAssigned();
    this.rows.set(key, { clientId, productId, createdAt: new Date(now.getTime()) });
  }

  unassign(clientId: string, productId: string): boolean {
    return this.rows.delete(keyOf(clientId, productId));
  }

  isAssigned(clientId: string, productId: string): boolean {
    return this.rows.has(keyOf(clientId, productId));
  }

  /** Ordenados por id de producto, como la versión Drizzle. */
  listProductIdsOf(clientId: string): string[] {
    return [...this.rows.values()]
      .filter((row) => row.clientId === clientId)
      .map((row) => row.productId)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /** Foto del contenido, para que `InMemoryUnitOfWork` pueda hacer rollback. */
  snapshot(): Map<string, Assignment> {
    return new Map(this.rows);
  }

  restore(snapshot: Map<string, Assignment>): void {
    this.rows.clear();
    for (const [key, row] of snapshot) this.rows.set(key, row);
  }
}
