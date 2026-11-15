import type { TransactionalRepositories, UnitOfWork } from '../../src/application/shared/UnitOfWork.js';
import type { InMemorySessionRepository } from './InMemorySessionRepository.js';
import type { InMemoryUserRepository } from './InMemoryUserRepository.js';

/**
 * Doble de la UnitOfWork. Igual que `better-sqlite3.transaction()`:
 * - si `fn` lanza, revierte los cambios hechos sobre los repositorios en memoria (usuarios y
 *   sesiones) y propaga el error;
 * - rechaza una `fn` que devuelve una Promise (y también revierte), así un `await` dentro de `run`
 *   falla también en los tests (ADR-003).
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  runs = 0;

  constructor(
    private readonly users: InMemoryUserRepository,
    private readonly sessions: InMemorySessionRepository,
  ) {}

  run<T>(fn: (repos: TransactionalRepositories) => T): T {
    this.runs += 1;
    const usersBefore = this.users.snapshot();
    const sessionsBefore = this.sessions.snapshot();
    try {
      const result = fn({ users: this.users, sessions: this.sessions });
      if (result !== null && typeof (result as { then?: unknown })?.then === 'function') {
        throw new TypeError('UnitOfWork.run no admite funciones asíncronas');
      }
      return result;
    } catch (error) {
      this.users.restore(usersBefore);
      this.sessions.restore(sessionsBefore);
      throw error;
    }
  }
}
