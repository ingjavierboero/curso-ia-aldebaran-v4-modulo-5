import { assertCan } from '../../domain/auth/Authorization.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { ClientNotFound, ProductNotAssigned } from './errors.js';

export interface UnassignProductDeps {
  uow: UnitOfWork;
}

/**
 * Quita un producto asignado a un cliente (FR-15), Activo o Inactivo (D-03), por un Admin o Editor
 * (FR-19). Si el cliente no existe, `ClientNotFound`; si el producto no está asignado (o no existe),
 * `ProductNotAssigned`.
 */
export class UnassignProduct {
  constructor(private readonly deps: UnassignProductDeps) {}

  execute(actor: Actor, clientId: string, productId: string): void {
    assertCan(actor.role, 'clients.manage');

    this.deps.uow.run(({ users, clients, clientProducts }) => {
      requireActor(users, actor, 'clients.manage');
      if (!clients.findById(clientId)) throw new ClientNotFound();
      if (!clientProducts.unassign(clientId, productId)) throw new ProductNotAssigned();
    });
  }
}
