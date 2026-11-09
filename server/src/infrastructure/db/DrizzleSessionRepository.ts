import { eq } from 'drizzle-orm';
import { Session } from '../../domain/auth/Session.js';
import type { SessionRepository } from '../../domain/auth/SessionRepository.js';
import type { SqliteHandle } from './handle.js';
import { parseIsoDate } from './parseIsoDate.js';
import { sessions } from './schema.js';

type SessionRow = typeof sessions.$inferSelect;

/** `SessionRepository` síncrono sobre SQLite (ADR-003). Fechas: `Date` en la entidad, ISO 8601 en la tabla. */
export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: SqliteHandle) {}

  insert(session: Session): void {
    this.db
      .insert(sessions)
      .values({
        id: session.id,
        userId: session.userId,
        tokenHash: session.tokenHash,
        createdAt: session.createdAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
      })
      .run();
  }

  findByTokenHash(tokenHash: string): Session | null {
    const row = this.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
    return row ? toEntity(row) : null;
  }

  touch(id: string, now: Date): void {
    this.db.update(sessions).set({ lastActivityAt: now.toISOString() }).where(eq(sessions.id, id)).run();
  }

  delete(id: string): void {
    this.db.delete(sessions).where(eq(sessions.id, id)).run();
  }
}

function toEntity(row: SessionRow): Session {
  return new Session({
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    createdAt: parseIsoDate(row.createdAt, 'sessions.created_at'),
    lastActivityAt: parseIsoDate(row.lastActivityAt, 'sessions.last_activity_at'),
  });
}
