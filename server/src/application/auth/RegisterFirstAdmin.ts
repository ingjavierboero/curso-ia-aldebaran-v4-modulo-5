import type { PasswordHasher } from '../../domain/auth/PasswordHasher.js';
import type { Clock } from '../../domain/shared/Clock.js';
import { Email } from '../../domain/user/Email.js';
import { PasswordPolicy } from '../../domain/user/PasswordPolicy.js';
import { parseUserName, User } from '../../domain/user/User.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { type PublicUser, toPublicUser } from './dto/PublicUser.js';
import { FirstAdminAlreadyExists } from './errors.js';

export interface RegisterFirstAdminDeps {
  uow: UnitOfWork;
  hasher: PasswordHasher;
  ids: IdGenerator;
  clock: Clock;
}

export interface RegisterFirstAdminInput {
  name: string;
  email: string;
  password: string;
}

/**
 * Registra el primer Admin Activo (FR-05) solo si no hay ningún usuario (FR-06).
 * R-04 / ADR-003: pre-check antes del hash (no se hashea si ya hay usuarios) y doble
 * verificación síncrona dentro de la unidad de trabajo, sin ningún `await` adentro.
 */
export class RegisterFirstAdmin {
  constructor(private readonly deps: RegisterFirstAdminDeps) {}

  async execute(input: RegisterFirstAdminInput): Promise<PublicUser> {
    const { uow, hasher, ids, clock } = this.deps;

    const name = parseUserName(input.name);
    const email = Email.create(input.email);
    PasswordPolicy.assert(input.password);

    if (uow.run(({ users }) => users.countAll()) > 0) throw new FirstAdminAlreadyExists();

    const passwordHash = await hasher.hash(input.password);

    const user = uow.run(({ users }) => {
      if (users.countAll() > 0) throw new FirstAdminAlreadyExists();
      const admin = new User({
        id: ids.next(),
        name,
        email,
        role: 'admin',
        status: 'activo',
        passwordHash,
        createdAt: clock.now(),
      });
      users.insert(admin);
      return admin;
    });

    return toPublicUser(user);
  }
}
