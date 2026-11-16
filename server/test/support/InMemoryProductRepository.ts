import { DuplicateProductName } from '../../src/domain/product/errors.js';
import type { Product } from '../../src/domain/product/Product.js';
import type { ProductRepository } from '../../src/domain/product/ProductRepository.js';

/** Comparación binaria, como el orden por defecto de SQLite (`ORDER BY name, id`). */
function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

const byName = (a: Product, b: Product) => compareText(a.name, b.name) || compareText(a.id, b.id);

/** Doble en memoria con la misma regla de unicidad que el UNIQUE de `products.name_normalized`. */
export class InMemoryProductRepository implements ProductRepository {
  private readonly rows = new Map<string, Product>();

  insert(product: Product): void {
    if (this.rows.has(product.id)) throw new Error(`UNIQUE products.id: ${product.id}`);
    this.assertUnique(product);
    this.rows.set(product.id, product);
  }

  /** Igual que un UPDATE por id: si no existe, no hace nada. */
  update(product: Product): void {
    if (!this.rows.has(product.id)) return;
    this.assertUnique(product);
    this.rows.set(product.id, product);
  }

  findById(id: string): Product | null {
    return this.rows.get(id) ?? null;
  }

  findByNameNormalized(nameNormalized: string): Product | null {
    for (const product of this.rows.values()) {
      if (product.nameNormalized === nameNormalized) return product;
    }
    return null;
  }

  findByIds(ids: readonly string[]): Product[] {
    const found: Product[] = [];
    for (const id of new Set(ids)) {
      const product = this.rows.get(id);
      if (product) found.push(product);
    }
    return found.sort(byName);
  }

  list(): Product[] {
    return [...this.rows.values()].sort(byName);
  }

  /** Foto del contenido, para que `InMemoryUnitOfWork` pueda hacer rollback. */
  snapshot(): Map<string, Product> {
    return new Map(this.rows);
  }

  restore(snapshot: Map<string, Product>): void {
    this.rows.clear();
    for (const [id, product] of snapshot) this.rows.set(id, product);
  }

  private assertUnique(product: Product): void {
    const owner = this.findByNameNormalized(product.nameNormalized);
    if (owner && owner.id !== product.id) throw new DuplicateProductName();
  }
}
