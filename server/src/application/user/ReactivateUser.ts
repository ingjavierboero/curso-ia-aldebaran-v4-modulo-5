import { assertCan } from '../../domain/auth/Authorization.js';
import { UserNotFound } from '../../domain/user/errors.js';
import { type PublicUser, toPublicUser } from '../auth/dto/PublicUser.js';
import type { Actor } from '../shared/Actor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { requireActor } from './requireActor.js';

export interface ReactivateUserDeps {
  uow: UnitOfWork;
}

/**
 * Reactiva a un usuario Inactivo (FR-08). Solo Admin (FR-11, FR-12). Reactivar a un Activo no
 * cambia nada y lo devuelve.
 */
export class ReactivateUser {
  constructor(private readonly deps: ReactivateUserDeps) {}

  execute(actor: Actor, id: string): PublicUser {
    assertCan(actor.role, 'users.manage');

    const result = this.deps.uow.run(({ users }) => {
      requireActor(users, actor, 'users.manage');
      const current = users.findById(id);
      if (!current) throw new UserNotFound();
      if (current.isActive()) return current;

      const next = current.reactivated();
      users.update(next);
      return next;
    });

    return toPublicUser(result);
  }
}
