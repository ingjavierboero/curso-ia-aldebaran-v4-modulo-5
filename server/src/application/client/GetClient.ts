import { assertCan } from '../../domain/auth/Authorization.js';
import type { ClientProductRepository } from '../../domain/client/ClientProductRepository.js';
import type { ClientRepository } from '../../domain/client/ClientRepository.js';
import type { ProductRepository } from '../../domain/product/ProductRepository.js';
import type { Actor } from '../shared/Actor.js';
import { type ClientDetail, toClientDetail } from './dto/ClientDetail.js';
import { ClientNotFound } from './errors.js';

export interface GetClientDeps {
  clients: ClientRepository;
  products: ProductRepository;
  clientProducts: ClientProductRepository;
}

/** Detalle de un cliente con sus productos asignados (FR-17), para los tres perfiles (FR-19). */
export class GetClient {
  constructor(private readonly deps: GetClientDeps) {}

  execute(actor: Actor, id: string): ClientDetail {
    assertCan(actor.role, 'clients.read');
    const { clients, products, clientProducts } = this.deps;
    const client = clients.findById(id);
    if (!client) throw new ClientNotFound();
    return toClientDetail(client, products.findByIds(clientProducts.listProductIdsOf(client.id)));
  }
}
