import type { Product } from './Product.js';

/** Puerto síncrono (ADR-003): nada de Promises, para poder usarse dentro de una UnitOfWork. */
export interface ProductRepository {
  /** Lanza `DuplicateProductName` si el nombre normalizado ya es de otro producto (UNIQUE, NFR-01). */
  insert(product: Product): void;
  /** Guarda nombre, precio, moneda y estado del producto con ese id. Mismo error de unicidad que `insert`. */
  update(product: Product): void;
  findById(id: string): Product | null;
  /** Por `Product.nameNormalized` (FR-11). */
  findByNameNormalized(nameNormalized: string): Product | null;
  /**
   * Los productos con esos ids que existen, ordenados por nombre. Los inexistentes no aparecen, un
   * id repetido aparece una sola vez y `[]` devuelve `[]`.
   */
  findByIds(ids: readonly string[]): Product[];
  /** Todos los productos, Activos e Inactivos, ordenados por nombre (FR-18). */
  list(): Product[];
}
