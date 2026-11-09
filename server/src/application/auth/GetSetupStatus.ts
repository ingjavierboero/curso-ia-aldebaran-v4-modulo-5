import type { UserRepository } from '../../domain/user/UserRepository.js';

export interface SetupStatus {
  needsFirstAdmin: boolean;
}

export class GetSetupStatus {
  constructor(private readonly deps: { users: UserRepository }) {}

  execute(): SetupStatus {
    return { needsFirstAdmin: this.deps.users.countAll() === 0 };
  }
}
