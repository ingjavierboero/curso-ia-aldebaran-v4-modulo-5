import { assertCan } from '../../domain/auth/Authorization.js';
import type { ProductRepository } from '../../domain/product/ProductRepository.js';
import type { Actor } from '../shared/Actor.js';
import { sortBySpanishText } from '../shared/spanishOrder.js';
import { type PublicProduct, toPublicProduct } from './dto/PublicProduct.js';

export interface ListProductsDeps {
  products: ProductRepository;
}

/** Listado de productos Activos e Inactivos, por nombre (FR-18), para los tres perfiles (FR-19). */
export class ListProducts {
  constructor(private readonly deps: ListProductsDeps) {}

  execute(actor: Actor): PublicProduct[] {
    assertCan(actor.role, 'products.read');
    return sortBySpanishText(this.deps.products.list(), (product) => product.name).map(toPublicProduct);
  }
}
