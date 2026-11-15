import type { Session } from './Session.js';

/** Puerto síncrono (ADR-003). */
export interface SessionRepository {
  insert(session: Session): void;
  findByTokenHash(tokenHash: string): Session | null;
  touch(id: string, now: Date): void;
  delete(id: string): void;
  /** Borra todas las sesiones del usuario (FR-07) y devuelve cuántas borró. */
  deleteByUserId(userId: string): number;
  /**
   * Borra las sesiones del usuario salvo la de id `keepSessionId` (FEAT-007, FR-07) y devuelve
   * cuántas borró. Nunca toca sesiones de otros usuarios.
   */
  deleteByUserIdExcept(userId: string, keepSessionId: string): number;
}
