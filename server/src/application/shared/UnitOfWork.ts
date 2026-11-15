import type { SessionRepository } from '../../domain/auth/SessionRepository.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';

export interface TransactionalRepositories {
  users: UserRepository;
  sessions: SessionRepository;
}

/**
 * Unidad de trabajo síncrona (ADR-003). `fn` corre dentro de una transacción y no puede
 * devolver una Promise: ningún `await` dentro de `run`.
 */
export interface UnitOfWork {
  run<T>(fn: (repos: TransactionalRepositories) => T): T;
}
