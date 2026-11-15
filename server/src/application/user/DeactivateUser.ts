import { assertCan } from '../../domain/auth/Authorization.js';
import { assertKeepsAnActiveAdmin } from '../../domain/user/AdminPolicy.js';
import { UserNotFound } from '../../domain/user/errors.js';
import { type PublicUser, toPublicUser } from '../auth/dto/PublicUser.js';
import type { Actor } from '../shared/Actor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { requireActor } from './requireActor.js';

export interface DeactivateUserDeps {
  uow: UnitOfWork;
}

/**
 * Da de baja a un usuario (pasa a Inactivo) y borra todas sus sesiones en la misma transacción
 * (FR-07), salvo que sea el último Admin Activo (FR-09, NFR-02). Solo Admin (FR-11, FR-12).
 * Dar de baja a un Inactivo no cambia nada y lo devuelve.
 */
export class DeactivateUser {
  constructor(private readonly deps: DeactivateUserDeps) {}

  execute(actor: Actor, id: string): PublicUser {
    assertCan(actor.role, 'users.manage');

    const result = this.deps.uow.run(({ users, sessions }) => {
      requireActor(users, actor, 'users.manage');
      const current = users.findById(id);
      if (!current) throw new UserNotFound();
      if (!current.isActive()) return current;

      const next = current.deactivated();
      assertKeepsAnActiveAdmin(current, next, users.countActiveAdmins());
      users.update(next);
      sessions.deleteByUserId(next.id);
      return next;
    });

    return toPublicUser(result);
  }
}
