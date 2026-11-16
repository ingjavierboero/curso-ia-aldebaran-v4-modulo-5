import { assertCan } from '../../domain/auth/Authorization.js';
import { ProductAlreadyAssigned } from '../../domain/client/errors.js';
import type { Clock } from '../../domain/shared/Clock.js';
import { ProductInactive, ProductNotFound } from '../product/errors.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { type ClientDetail, toClientDetail } from './dto/ClientDetail.js';
import { ClientNotFound } from './errors.js';

export interface AssignProductsDeps {
  uow: UnitOfWork;
  clock: Clock;
}

/**
 * Asigna productos a un cliente, Activo o Inactivo (FR-13, D-03), por un Admin o Editor (FR-19). Todo
 * o nada: controla el lote entero antes de asignar el primero, y cualquier error revierte la
 * transacción. Cada producto tiene que existir, estar Activo (FR-14) y no estar ya asignado (FR-13).
 * `productIds` llega validado por la ruta: no vacío, sin repetidos y de hasta 50.
 */
export class AssignProducts {
  constructor(private readonly deps: AssignProductsDeps) {}

  execute(actor: Actor, clientId: string, productIds: readonly string[]): ClientDetail {
    const { uow, clock } = this.deps;
    assertCan(actor.role, 'clients.manage');

    return uow.run(({ users, clients, products, clientProducts }) => {
      requireActor(users, actor, 'clients.manage');
      const client = clients.findById(clientId);
      if (!client) throw new ClientNotFound();

      // Un id repetido se asigna una vez: no es un "ya asignado". La ruta ya los rechaza; esto
      // protege a cualquier otro llamador.
      const uniqueIds = [...new Set(productIds)];
      for (const productId of uniqueIds) {
        const product = products.findById(productId);
        if (!product) throw new ProductNotFound();
        if (!product.isActive()) throw new ProductInactive();
        if (clientProducts.isAssigned(client.id, product.id)) throw new ProductAlreadyAssigned();
      }

      const now = clock.now();
      for (const productId of uniqueIds) clientProducts.assign(client.id, productId, now);

      return toClientDetail(client, products.findByIds(clientProducts.listProductIdsOf(client.id)));
    });
  }
}
