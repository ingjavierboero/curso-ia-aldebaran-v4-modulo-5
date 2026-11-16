import type { PasswordResetTokenRepository } from '../../domain/auth/PasswordResetTokenRepository.js';
import type { SessionRepository } from '../../domain/auth/SessionRepository.js';
import type { ClientProductRepository } from '../../domain/client/ClientProductRepository.js';
import type { ClientRepository } from '../../domain/client/ClientRepository.js';
import type { ProductRepository } from '../../domain/product/ProductRepository.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';

export interface TransactionalRepositories {
  users: UserRepository;
  sessions: SessionRepository;
  resetTokens: PasswordResetTokenRepository;
  clients: ClientRepository;
  products: ProductRepository;
  clientProducts: ClientProductRepository;
}

/**
 * Unidad de trabajo síncrona (ADR-003). `fn` corre dentro de una transacción y no puede
 * devolver una Promise: ningún `await` dentro de `run`.
 */
export interface UnitOfWork {
  run<T>(fn: (repos: TransactionalRepositories) => T): T;
}
