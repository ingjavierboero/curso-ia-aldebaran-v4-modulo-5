import {
  PasswordResetToken,
  type PasswordResetTokenProps,
  RESET_EMAIL_COOLDOWN_MS,
} from '../../src/domain/auth/PasswordResetToken.js';
import type { PasswordResetTokenRepository } from '../../src/domain/auth/PasswordResetTokenRepository.js';

/** Doble en memoria. No conoce a los usuarios: la FK solo la prueba la versión Drizzle. */
export class InMemoryPasswordResetTokenRepository implements PasswordResetTokenRepository {
  private readonly rows = new Map<string, PasswordResetToken>();

  insert(token: PasswordResetToken): void {
    if (this.rows.has(token.id)) throw new Error(`UNIQUE password_reset_tokens.id: ${token.id}`);
    if (this.findByTokenHash(token.tokenHash)) {
      throw new Error(`UNIQUE password_reset_tokens.token_hash: ${token.tokenHash}`);
    }
    this.rows.set(token.id, token);
  }

  findByTokenHash(tokenHash: string): PasswordResetToken | null {
    for (const token of this.rows.values()) {
      if (token.tokenHash === tokenHash) return token;
    }
    return null;
  }

  latestCreatedAtForUser(userId: string): Date | null {
    let latest: Date | null = null;
    for (const token of this.rows.values()) {
      if (token.userId === userId && (latest === null || token.createdAt.getTime() > latest.getTime())) {
        latest = token.createdAt;
      }
    }
    return latest === null ? null : new Date(latest.getTime());
  }

  invalidateAllForUser(userId: string, now: Date): void {
    for (const [id, token] of this.rows) {
      if (token.userId === userId && token.usedAt === null && token.invalidatedAt === null) {
        this.rows.set(id, withChanges(token, { invalidatedAt: now }));
      }
    }
  }

  markUsed(id: string, now: Date): boolean {
    const current = this.rows.get(id);
    if (!current || current.usedAt !== null || current.invalidatedAt !== null) return false;
    this.rows.set(id, withChanges(current, { usedAt: now }));
    return true;
  }

  deleteExpiredForUser(userId: string, now: Date): void {
    const threshold = now.getTime() - RESET_EMAIL_COOLDOWN_MS;
    for (const [id, token] of this.rows) {
      if (token.userId === userId && token.expiresAt.getTime() < threshold) this.rows.delete(id);
    }
  }

  /** Foto del contenido, para que `InMemoryUnitOfWork` pueda hacer rollback. */
  snapshot(): Map<string, PasswordResetToken> {
    return new Map(this.rows);
  }

  restore(snapshot: Map<string, PasswordResetToken>): void {
    this.rows.clear();
    for (const [id, token] of snapshot) this.rows.set(id, token);
  }
}

/** Copia del token con los campos cambiados (la entidad es inmutable). */
function withChanges(token: PasswordResetToken, changes: Partial<PasswordResetTokenProps>): PasswordResetToken {
  return new PasswordResetToken({
    id: token.id,
    userId: token.userId,
    tokenHash: token.tokenHash,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    usedAt: token.usedAt,
    invalidatedAt: token.invalidatedAt,
    ...changes,
  });
}
