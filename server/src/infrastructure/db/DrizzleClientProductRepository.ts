import { and, asc, eq } from 'drizzle-orm';
import type { ClientProductRepository } from '../../domain/client/ClientProductRepository.js';
import { ProductAlreadyAssigned } from '../../domain/client/errors.js';
import type { SqliteHandle } from './handle.js';
import { clientProducts } from './schema.js';
import { isConstraintViolation } from './sqliteConstraint.js';

/**
 * `ClientProductRepository` síncrono sobre SQLite (ADR-003). `assign` también lanza si el cliente o
 * el producto no existen (FK a `clients.id` y `products.id`).
 */
export class DrizzleClientProductRepository implements ClientProductRepository {
  constructor(private readonly db: SqliteHandle) {}

  assign(clientId: string, productId: string, now: Date): void {
    try {
      this.db.insert(clientProducts).values({ clientId, productId, createdAt: now.toISOString() }).run();
    } catch (err) {
      if (isConstraintViolation(err, 'SQLITE_CONSTRAINT_PRIMARYKEY', PRIMARY_KEY_MESSAGE)) {
        throw new ProductAlreadyAssigned();
      }
      throw err;
    }
  }

  unassign(clientId: string, productId: string): boolean {
    return this.db.delete(clientProducts).where(byPair(clientId, productId)).run().changes > 0;
  }

  isAssigned(clientId: string, productId: string): boolean {
    return (
      this.db.select({ clientId: clientProducts.clientId }).from(clientProducts).where(byPair(clientId, productId)).get() !==
      undefined
    );
  }

  /** Ordenados por id de producto, para que el resultado sea determinista. */
  listProductIdsOf(clientId: string): string[] {
    return this.db
      .select({ productId: clientProducts.productId })
      .from(clientProducts)
      .where(eq(clientProducts.clientId, clientId))
      .orderBy(asc(clientProducts.productId))
      .all()
      .map((row) => row.productId);
  }
}

function byPair(clientId: string, productId: string) {
  return and(eq(clientProducts.clientId, clientId), eq(clientProducts.productId, productId));
}

/** Mensaje exacto de SQLite para la PK compuesta `(client_id, product_id)`. */
const PRIMARY_KEY_MESSAGE = /^UNIQUE constraint failed: client_products\.client_id, client_products\.product_id$/;
