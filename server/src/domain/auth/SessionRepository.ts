import type { Session } from './Session.js';

/** Puerto síncrono (ADR-003). */
export interface SessionRepository {
  insert(session: Session): void;
  findByTokenHash(tokenHash: string): Session | null;
  touch(id: string, now: Date): void;
  delete(id: string): void;
}
