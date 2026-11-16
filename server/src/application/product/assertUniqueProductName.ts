import { DuplicateProductName } from '../../domain/product/errors.js';
import type { Product } from '../../domain/product/Product.js';
import type { ProductRepository } from '../../domain/product/ProductRepository.js';

/**
 * Control previo (FR-11, NFR-01), dentro de `uow.run`: ningún OTRO producto tiene el mismo nombre
 * normalizado. El UNIQUE de `products.name_normalized` sigue siendo la última barrera.
 */
export function assertUniqueProductName(products: ProductRepository, product: Product): void {
  const owner = products.findByNameNormalized(product.nameNormalized);
  if (owner && owner.id !== product.id) throw new DuplicateProductName();
}
