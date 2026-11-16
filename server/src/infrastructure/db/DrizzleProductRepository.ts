import { asc, eq, inArray } from 'drizzle-orm';
import { DuplicateProductName } from '../../domain/product/errors.js';
import { Price } from '../../domain/product/Price.js';
import { Product } from '../../domain/product/Product.js';
import type { ProductRepository } from '../../domain/product/ProductRepository.js';
import type { SqliteHandle } from './handle.js';
import { parseIsoDate } from './parseIsoDate.js';
import { products } from './schema.js';
import { isConstraintViolation } from './sqliteConstraint.js';
import { InvalidStoredValue, rehydrate } from './storedValue.js';

type ProductRow = typeof products.$inferSelect;

/**
 * `ProductRepository` síncrono sobre SQLite (ADR-003). El precio se guarda en centavos enteros
 * (`price_cents`) y se rehidrata con `Price.fromCents`: nunca pasa por un float (NFR-03).
 */
export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly db: SqliteHandle) {}

  insert(product: Product): void {
    translatingUniqueViolations(() => {
      this.db.insert(products).values(toRow(product)).run();
    });
  }

  update(product: Product): void {
    const { id: _id, createdAt: _createdAt, ...changes } = toRow(product);
    translatingUniqueViolations(() => {
      this.db.update(products).set(changes).where(eq(products.id, product.id)).run();
    });
  }

  findById(id: string): Product | null {
    const row = this.db.select().from(products).where(eq(products.id, id)).get();
    return row ? toEntity(row) : null;
  }

  findByNameNormalized(nameNormalized: string): Product | null {
    const row = this.db.select().from(products).where(eq(products.nameNormalized, nameNormalized)).get();
    return row ? toEntity(row) : null;
  }

  findByIds(ids: readonly string[]): Product[] {
    if (ids.length === 0) return [];
    const unique = [...new Set(ids)];
    return this.db
      .select()
      .from(products)
      .where(inArray(products.id, unique))
      .orderBy(asc(products.name), asc(products.id))
      .all()
      .map(toEntity);
  }

  list(): Product[] {
    return this.db.select().from(products).orderBy(asc(products.name), asc(products.id)).all().map(toEntity);
  }
}

function toRow(product: Product): ProductRow {
  return {
    id: product.id,
    name: product.name,
    nameNormalized: product.nameNormalized,
    priceCents: product.price.cents,
    currency: product.price.currency,
    status: product.status,
    createdAt: product.createdAt.toISOString(),
  };
}

/**
 * Un valor guardado que el dominio rechaza es un dato corrupto: `InvalidStoredValue`. También lo es un
 * `name_normalized` distinto del que el dominio deriva del nombre: rompería la unicidad (FR-11).
 */
function toEntity(row: ProductRow): Product {
  const product = new Product({
    id: row.id,
    name: row.name,
    price: rehydrate('products.price_cents', () => Price.fromCents(row.priceCents, row.currency)),
    status: row.status,
    createdAt: parseIsoDate(row.createdAt, 'products.created_at'),
  });
  if (product.nameNormalized !== row.nameNormalized) throw new InvalidStoredValue('products.name_normalized');
  return product;
}

/** Mensaje exacto de SQLite para el UNIQUE de `products.name_normalized`. */
const UNIQUE_NAME_MESSAGE = /^UNIQUE constraint failed: products\.name_normalized$/;

function translatingUniqueViolations(write: () => void): void {
  try {
    write();
  } catch (err) {
    if (isConstraintViolation(err, 'SQLITE_CONSTRAINT_UNIQUE', UNIQUE_NAME_MESSAGE)) throw new DuplicateProductName();
    throw err;
  }
}
