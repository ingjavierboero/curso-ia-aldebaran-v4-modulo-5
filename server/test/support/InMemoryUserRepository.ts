import type { Email } from '../../src/domain/user/Email.js';
import type { User } from '../../src/domain/user/User.js';
import type { UserRepository } from '../../src/domain/user/UserRepository.js';

export class InMemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, User>();

  countAll(): number {
    return this.rows.size;
  }

  findByEmail(email: Email): User | null {
    for (const user of this.rows.values()) {
      if (user.email.value === email.value) return user;
    }
    return null;
  }

  findById(id: string): User | null {
    return this.rows.get(id) ?? null;
  }

  insert(user: User): void {
    if (this.rows.has(user.id)) throw new Error(`UNIQUE users.id: ${user.id}`);
    if (this.findByEmail(user.email)) throw new Error(`UNIQUE users.email: ${user.email.value}`);
    this.rows.set(user.id, user);
  }

  all(): User[] {
    return [...this.rows.values()];
  }

  /** Foto del contenido, para que `InMemoryUnitOfWork` pueda hacer rollback. */
  snapshot(): Map<string, User> {
    return new Map(this.rows);
  }

  restore(snapshot: Map<string, User>): void {
    this.rows.clear();
    for (const [id, user] of snapshot) this.rows.set(id, user);
  }
}
