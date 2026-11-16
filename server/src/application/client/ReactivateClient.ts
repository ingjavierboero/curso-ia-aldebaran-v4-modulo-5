import { assertCan } from '../../domain/auth/Authorization.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { type PublicClient, toPublicClient } from './dto/PublicClient.js';
import { ClientNotFound } from './errors.js';

export interface ReactivateClientDeps {
  uow: UnitOfWork;
}

/**
 * Reactiva a un cliente Inactivo (FR-03). Admin o Editor (FR-19). Reactivar a uno Activo no cambia
 * nada y lo devuelve.
 */
export class ReactivateClient {
  constructor(private readonly deps: ReactivateClientDeps) {}

  execute(actor: Actor, id: string): PublicClient {
    assertCan(actor.role, 'clients.manage');

    const result = this.deps.uow.run(({ users, clients }) => {
      requireActor(users, actor, 'clients.manage');
      const current = clients.findById(id);
      if (!current) throw new ClientNotFound();
      if (current.isActive()) return current;

      const next = current.reactivated();
      clients.update(next);
      return next;
    });

    return toPublicClient(result);
  }
}
