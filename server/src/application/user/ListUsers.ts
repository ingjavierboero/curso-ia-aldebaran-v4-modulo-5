import { assertCan } from '../../domain/auth/Authorization.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import { type PublicUser, toPublicUser } from '../auth/dto/PublicUser.js';
import type { Actor } from '../shared/Actor.js';

export interface ListUsersDeps {
  users: UserRepository;
}

/** Listado de usuarios Activos e Inactivos, por nombre, solo para Admin (FR-01, FR-10, FR-11). */
export class ListUsers {
  constructor(private readonly deps: ListUsersDeps) {}

  execute(actor: Actor): PublicUser[] {
    assertCan(actor.role, 'users.read');
    return this.deps.users.listAll().map(toPublicUser);
  }
}
