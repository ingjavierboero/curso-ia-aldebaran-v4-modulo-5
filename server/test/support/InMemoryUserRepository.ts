import type { Email } from '../../src/domain/user/Email.js';
import { EmailAlreadyInUse } from '../../src/domain/user/errors.js';
import type { User } from '../../src/domain/user/User.js';
import type { UserRepository } from '../../src/domain/user/UserRepository.js';

/** Comparación binaria, como el orden por defecto de SQLite (`ORDER BY name, id`). */
function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export class InMemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, User>();

  countAll(): number {
    return this.rows.size;
  }

  countActiveAdmins(): number {
    let n = 0;
    for (const user of this.rows.values()) if (user.isActiveAdmin()) n += 1;
    return n;
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

  listAll(): User[] {
    return [...this.rows.values()].sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));
  }

  insert(user: User): void {
    if (this.rows.has(user.id)) throw new Error(`UNIQUE users.id: ${user.id}`);
    if (this.findByEmail(user.email)) throw new EmailAlreadyInUse();
    this.rows.set(user.id, user);
  }

  /** Igual que un UPDATE por id: si no existe, no hace nada. */
  update(user: User): void {
    if (!this.rows.has(user.id)) return;
    const owner = this.findByEmail(user.email);
    if (owner && owner.id !== user.id) throw new EmailAlreadyInUse();
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
