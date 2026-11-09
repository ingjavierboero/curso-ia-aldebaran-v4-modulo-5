import type { TransactionalRepositories, UnitOfWork } from '../../src/application/shared/UnitOfWork.js';
import type { InMemoryUserRepository } from './InMemoryUserRepository.js';

/**
 * Doble de la UnitOfWork. Igual que `better-sqlite3.transaction()`:
 * - si `fn` lanza, revierte los cambios hechos sobre los repositorios en memoria y propaga el error;
 * - rechaza una `fn` que devuelve una Promise (y también revierte), así un `await` dentro de `run`
 *   falla también en los tests (ADR-003).
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  runs = 0;

  constructor(private readonly users: InMemoryUserRepository) {}

  run<T>(fn: (repos: TransactionalRepositories) => T): T {
    this.runs += 1;
    const usersBefore = this.users.snapshot();
    try {
      const result = fn({ users: this.users });
      if (result !== null && typeof (result as { then?: unknown })?.then === 'function') {
        throw new TypeError('UnitOfWork.run no admite funciones asíncronas');
      }
      return result;
    } catch (error) {
      this.users.restore(usersBefore);
      throw error;
    }
  }
}
