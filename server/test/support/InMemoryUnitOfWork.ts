import type { TransactionalRepositories, UnitOfWork } from '../../src/application/shared/UnitOfWork.js';
import { InMemoryClientProductRepository } from './InMemoryClientProductRepository.js';
import { InMemoryClientRepository } from './InMemoryClientRepository.js';
import { InMemoryPasswordResetTokenRepository } from './InMemoryPasswordResetTokenRepository.js';
import { InMemoryProductRepository } from './InMemoryProductRepository.js';
import type { InMemorySessionRepository } from './InMemorySessionRepository.js';
import { InMemorySettingsRepository } from './InMemorySettingsRepository.js';
import type { InMemoryUserRepository } from './InMemoryUserRepository.js';

/** Repositorios del doble. Los opcionales, si faltan, son repositorios propios vacíos. */
export interface InMemoryUnitOfWorkRepositories {
  users: InMemoryUserRepository;
  sessions: InMemorySessionRepository;
  resetTokens?: InMemoryPasswordResetTokenRepository;
  clients?: InMemoryClientRepository;
  products?: InMemoryProductRepository;
  clientProducts?: InMemoryClientProductRepository;
  settings?: InMemorySettingsRepository;
}

/**
 * Doble de la UnitOfWork. Igual que `better-sqlite3.transaction()`:
 * - si `fn` lanza, revierte los cambios hechos sobre todos los repositorios en memoria (usuarios,
 *   sesiones, tokens de recuperación, clientes, productos, asignaciones y configuración) y propaga
 *   el error;
 * - rechaza una `fn` que devuelve una Promise (y también revierte), así un `await` dentro de `run`
 *   falla también en los tests (ADR-003).
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  runs = 0;
  private readonly repos: Required<InMemoryUnitOfWorkRepositories>;

  constructor(repos: InMemoryUnitOfWorkRepositories) {
    this.repos = {
      users: repos.users,
      sessions: repos.sessions,
      resetTokens: repos.resetTokens ?? new InMemoryPasswordResetTokenRepository(),
      clients: repos.clients ?? new InMemoryClientRepository(),
      products: repos.products ?? new InMemoryProductRepository(),
      clientProducts: repos.clientProducts ?? new InMemoryClientProductRepository(),
      settings: repos.settings ?? new InMemorySettingsRepository(),
    };
  }

  run<T>(fn: (repos: TransactionalRepositories) => T): T {
    this.runs += 1;
    const { users, sessions, resetTokens, clients, products, clientProducts, settings } = this.repos;
    const usersBefore = users.snapshot();
    const sessionsBefore = sessions.snapshot();
    const resetTokensBefore = resetTokens.snapshot();
    const clientsBefore = clients.snapshot();
    const productsBefore = products.snapshot();
    const clientProductsBefore = clientProducts.snapshot();
    const settingsBefore = settings.snapshot();
    try {
      const result = fn({ users, sessions, resetTokens, clients, products, clientProducts, settings });
      if (result !== null && typeof (result as { then?: unknown })?.then === 'function') {
        throw new TypeError('UnitOfWork.run no admite funciones asíncronas');
      }
      return result;
    } catch (error) {
      users.restore(usersBefore);
      sessions.restore(sessionsBefore);
      resetTokens.restore(resetTokensBefore);
      clients.restore(clientsBefore);
      products.restore(productsBefore);
      clientProducts.restore(clientProductsBefore);
      settings.restore(settingsBefore);
      throw error;
    }
  }
}
