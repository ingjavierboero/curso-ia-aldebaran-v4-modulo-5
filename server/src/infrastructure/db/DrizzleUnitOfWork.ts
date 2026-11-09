import type { TransactionalRepositories, UnitOfWork } from '../../application/shared/UnitOfWork.js';
import type { Db } from './client.js';
import { DrizzleUserRepository } from './DrizzleUserRepository.js';

/**
 * Unidad de trabajo sobre una transacción `IMMEDIATE` de better-sqlite3 (ADR-003, R-04): toma el lock
 * de escritura al empezar, así dos `countAll()+insert` concurrentes quedan serializados.
 * Si `fn` lanza, se hace rollback y se propaga el error; si `fn` devuelve una Promise, better-sqlite3
 * lanza `TypeError` y también revierte.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Db) {}

  run<T>(fn: (repos: TransactionalRepositories) => T): T {
    return this.db.transaction((tx) => fn({ users: new DrizzleUserRepository(tx) }), { behavior: 'immediate' });
  }
}
