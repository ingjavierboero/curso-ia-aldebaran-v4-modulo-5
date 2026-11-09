import { count, eq } from 'drizzle-orm';
import { FirstAdminAlreadyExists } from '../../application/auth/errors.js';
import { Email } from '../../domain/user/Email.js';
import { User } from '../../domain/user/User.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import type { SqliteHandle } from './handle.js';
import { parseIsoDate } from './parseIsoDate.js';
import { users } from './schema.js';

type UserRow = typeof users.$inferSelect;

/** `UserRepository` síncrono sobre SQLite (ADR-003). Fechas: `Date` en la entidad, ISO 8601 en la tabla. */
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: SqliteHandle) {}

  countAll(): number {
    const row = this.db.select({ n: count() }).from(users).get();
    return row?.n ?? 0;
  }

  findByEmail(email: Email): User | null {
    const row = this.db.select().from(users).where(eq(users.email, email.value)).get();
    return row ? toEntity(row) : null;
  }

  findById(id: string): User | null {
    const row = this.db.select().from(users).where(eq(users.id, id)).get();
    return row ? toEntity(row) : null;
  }

  insert(user: User): void {
    try {
      this.db
        .insert(users)
        .values({
          id: user.id,
          name: user.name,
          email: user.email.value,
          role: user.role,
          status: user.status,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt.toISOString(),
        })
        .run();
    } catch (err) {
      if (isUniqueEmailViolation(err)) throw new FirstAdminAlreadyExists();
      throw err;
    }
  }
}

function toEntity(row: UserRow): User {
  return new User({
    id: row.id,
    name: row.name,
    // los emails se guardan ya normalizados por el dominio
    email: Email.create(row.email),
    role: row.role,
    status: row.status,
    passwordHash: row.passwordHash,
    createdAt: parseIsoDate(row.createdAt, 'users.created_at'),
  });
}

/** Mensaje exacto de SQLite para el UNIQUE de `users.email` (no matchea `users.email_xxx`). */
const UNIQUE_EMAIL_MESSAGE = /^UNIQUE constraint failed: users\.email$/;

/**
 * Violación del UNIQUE de `users.email`. Con better-sqlite3 (driver síncrono) drizzle-orm 0.45.4 NO
 * envuelve el `SqliteError` en `DrizzleQueryError`: llega tal cual. Se recorre igual la cadena de
 * `cause` por si una versión futura de Drizzle (o un driver async) lo envuelve.
 */
function isUniqueEmailViolation(err: unknown): boolean {
  for (let current: unknown = err, depth = 0; current instanceof Error && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' && UNIQUE_EMAIL_MESSAGE.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}
