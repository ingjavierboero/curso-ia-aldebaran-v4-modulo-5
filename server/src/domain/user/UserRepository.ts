import type { Email } from './Email.js';
import type { User } from './User.js';

/** Puerto síncrono (ADR-003): nada de Promises, para poder usarse dentro de una UnitOfWork. */
export interface UserRepository {
  countAll(): number;
  findByEmail(email: Email): User | null;
  findById(id: string): User | null;
  insert(user: User): void;
}
