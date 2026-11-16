import type { PasswordResetToken } from './PasswordResetToken.js';

/** Puerto síncrono (ADR-003) de los tokens de recuperación de contraseña (FEAT-008). */
export interface PasswordResetTokenRepository {
  /** Lanza si el `token_hash` ya existe (UNIQUE). */
  insert(token: PasswordResetToken): void;
  findByTokenHash(tokenHash: string): PasswordResetToken | null;
  /** Fecha de emisión del token más reciente del usuario, o null si no tiene ninguno. */
  latestCreatedAtForUser(userId: string): Date | null;
  /** Pone `invalidated_at = now` en los tokens del usuario sin `used_at` ni `invalidated_at`. */
  invalidateAllForUser(userId: string, now: Date): void;
  /**
   * Pone `used_at = now` solo si el token no estaba usado ni anulado. Devuelve true si lo marcó;
   * false si ya estaba usado o anulado, o si no existe.
   */
  markUsed(id: string, now: Date): boolean;
  /**
   * Borra los tokens del usuario vencidos hace más de `RESET_EMAIL_COOLDOWN_MS`; conserva los
   * recientes para no perder el dato del enfriamiento.
   */
  deleteExpiredForUser(userId: string, now: Date): void;
}
