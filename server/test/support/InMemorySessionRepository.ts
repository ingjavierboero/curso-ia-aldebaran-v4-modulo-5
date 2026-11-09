import { Session } from '../../src/domain/auth/Session.js';
import type { SessionRepository } from '../../src/domain/auth/SessionRepository.js';

export class InMemorySessionRepository implements SessionRepository {
  private readonly rows = new Map<string, Session>();

  insert(session: Session): void {
    if (this.rows.has(session.id)) throw new Error(`UNIQUE sessions.id: ${session.id}`);
    if (this.findByTokenHash(session.tokenHash)) {
      throw new Error(`UNIQUE sessions.token_hash: ${session.tokenHash}`);
    }
    this.rows.set(session.id, session);
  }

  findByTokenHash(tokenHash: string): Session | null {
    for (const session of this.rows.values()) {
      if (session.tokenHash === tokenHash) return session;
    }
    return null;
  }

  touch(id: string, now: Date): void {
    const current = this.rows.get(id);
    if (!current) return;
    this.rows.set(
      id,
      new Session({
        id: current.id,
        userId: current.userId,
        tokenHash: current.tokenHash,
        createdAt: current.createdAt,
        lastActivityAt: new Date(now.getTime()),
      }),
    );
  }

  delete(id: string): void {
    this.rows.delete(id);
  }

  findById(id: string): Session | null {
    return this.rows.get(id) ?? null;
  }

  all(): Session[] {
    return [...this.rows.values()];
  }
}
