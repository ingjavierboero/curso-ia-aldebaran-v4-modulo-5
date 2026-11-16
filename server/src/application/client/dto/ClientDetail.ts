import type { Client } from '../../../domain/client/Client.js';
import type { Product } from '../../../domain/product/Product.js';
import { type PublicProduct, toPublicProduct } from '../../product/dto/PublicProduct.js';
import { sortBySpanishText } from '../../shared/spanishOrder.js';
import { type PublicClient, toPublicClient } from './PublicClient.js';

/** El detalle de un cliente: sus datos y los productos que tiene asignados (FR-17). */
export interface ClientDetail extends PublicClient {
  products: PublicProduct[];
}

/**
 * Mapper puro: el cliente y sus productos asignados (Activos e Inactivos), que lee el caso de uso.
 * Los productos salen ordenados por nombre como en español.
 */
export function toClientDetail(client: Client, assigned: readonly Product[]): ClientDetail {
  return {
    ...toPublicClient(client),
    products: sortBySpanishText(assigned, (product) => product.name).map(toPublicProduct),
  };
}
