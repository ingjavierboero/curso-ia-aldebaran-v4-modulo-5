import { assertCan } from '../../domain/auth/Authorization.js';
import { assertKeepsAnActiveAdmin } from '../../domain/user/AdminPolicy.js';
import { Email } from '../../domain/shared/Email.js';
import { EmailAlreadyInUse, UserNotFound } from '../../domain/user/errors.js';
import { parseUserName, parseUserRole } from '../../domain/user/User.js';
import { type PublicUser, toPublicUser } from '../auth/dto/PublicUser.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';

export interface UpdateUserDeps {
  uow: UnitOfWork;
}

/** Los campos ausentes no cambian. "Al menos uno" es forma del body y lo valida la ruta. */
export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: string;
}

/**
 * Modifica nombre, email y perfil de un usuario (FR-05, FR-06), solo Admin (FR-11). Dentro de la
 * transacción: relee al actor (FR-12), rechaza un email de otro usuario (FR-03) y que el cambio de
 * perfil deje al sistema sin Admin Activo (FR-09, NFR-02).
 */
export class UpdateUser {
  constructor(private readonly deps: UpdateUserDeps) {}

  execute(actor: Actor, id: string, input: UpdateUserInput): PublicUser {
    assertCan(actor.role, 'users.manage');

    const name = input.name === undefined ? undefined : parseUserName(input.name);
    const email = input.email === undefined ? undefined : Email.create(input.email);
    const role = input.role === undefined ? undefined : parseUserRole(input.role);

    const updated = this.deps.uow.run(({ users }) => {
      requireActor(users, actor, 'users.manage');
      const current = users.findById(id);
      if (!current) throw new UserNotFound();

      if (email) {
        const owner = users.findByEmail(email);
        if (owner && owner.id !== current.id) throw new EmailAlreadyInUse();
      }

      const next = current.withProfile({
        name: name ?? current.name,
        email: email ?? current.email,
        role: role ?? current.role,
      });
      assertKeepsAnActiveAdmin(current, next, users.countActiveAdmins());
      users.update(next);
      return next;
    });

    return toPublicUser(updated);
  }
}
