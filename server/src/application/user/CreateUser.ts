import { assertCan } from '../../domain/auth/Authorization.js';
import type { PasswordHasher } from '../../domain/auth/PasswordHasher.js';
import type { Clock } from '../../domain/shared/Clock.js';
import { Email } from '../../domain/user/Email.js';
import { EmailAlreadyInUse } from '../../domain/user/errors.js';
import { PasswordPolicy } from '../../domain/user/PasswordPolicy.js';
import { parseUserName, parseUserRole, User } from '../../domain/user/User.js';
import { type PublicUser, toPublicUser } from '../auth/dto/PublicUser.js';
import type { Actor } from '../shared/Actor.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { requireActor } from './requireActor.js';

export interface CreateUserDeps {
  uow: UnitOfWork;
  hasher: PasswordHasher;
  ids: IdGenerator;
  clock: Clock;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: string;
  password: string;
}

/**
 * Alta de un usuario Activo (FR-02) por un Admin (FR-11). Valida todo antes de hashear (FR-04,
 * NFR-03), hashea fuera de la transacción (ADR-003) y, dentro de ella, relee al actor (FR-12) y
 * verifica que el email no sea de otro usuario (FR-03).
 */
export class CreateUser {
  constructor(private readonly deps: CreateUserDeps) {}

  async execute(actor: Actor, input: CreateUserInput): Promise<PublicUser> {
    const { uow, hasher, ids, clock } = this.deps;
    assertCan(actor.role, 'users.manage');

    const name = parseUserName(input.name);
    const email = Email.create(input.email);
    const role = parseUserRole(input.role);
    PasswordPolicy.assert(input.password);

    const passwordHash = await hasher.hash(input.password);

    const created = uow.run(({ users }) => {
      requireActor(users, actor, 'users.manage');
      if (users.findByEmail(email)) throw new EmailAlreadyInUse();
      const user = new User({
        id: ids.next(),
        name,
        email,
        role,
        status: 'activo',
        passwordHash,
        createdAt: clock.now(),
      });
      users.insert(user);
      return user;
    });

    return toPublicUser(created);
  }
}
