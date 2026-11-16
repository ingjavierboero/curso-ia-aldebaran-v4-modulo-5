import { assertCan } from '../../domain/auth/Authorization.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { type PublicClient, toPublicClient } from './dto/PublicClient.js';
import { ClientNotFound } from './errors.js';

export interface DeactivateClientDeps {
  uow: UnitOfWork;
}

/**
 * Da de baja a un cliente: pasa a Inactivo y sigue en el listado (FR-03). Admin o Editor (FR-19).
 * Dar de baja a uno Inactivo no cambia nada y lo devuelve. Sus asignaciones se conservan.
 */
export class DeactivateClient {
  constructor(private readonly deps: DeactivateClientDeps) {}

  execute(actor: Actor, id: string): PublicClient {
    assertCan(actor.role, 'clients.manage');

    const result = this.deps.uow.run(({ users, clients }) => {
      requireActor(users, actor, 'clients.manage');
      const current = clients.findById(id);
      if (!current) throw new ClientNotFound();
      if (!current.isActive()) return current;

      const next = current.deactivated();
      clients.update(next);
      return next;
    });

    return toPublicClient(result);
  }
}
