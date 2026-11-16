import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { PasswordResetToken, RESET_EMAIL_COOLDOWN_MS } from '../../domain/auth/PasswordResetToken.js';
import type { PasswordResetTokenRepository } from '../../domain/auth/PasswordResetTokenRepository.js';
import type { SqliteHandle } from './handle.js';
import { parseIsoDate } from './parseIsoDate.js';
import { passwordResetTokens } from './schema.js';

type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;

/**
 * `PasswordResetTokenRepository` síncrono sobre SQLite (ADR-003). Fechas: `Date` en la entidad,
 * ISO 8601 en UTC en la tabla, así la comparación de texto respeta el orden temporal.
 * `insert` también lanza si el `user_id` no existe (FK a `users.id`, ON DELETE CASCADE).
 */
export class DrizzlePasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly db: SqliteHandle) {}

  insert(token: PasswordResetToken): void {
    this.db
      .insert(passwordResetTokens)
      .values({
        id: token.id,
        userId: token.userId,
        tokenHash: token.tokenHash,
        createdAt: token.createdAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
        usedAt: token.usedAt?.toISOString() ?? null,
        invalidatedAt: token.invalidatedAt?.toISOString() ?? null,
      })
      .run();
  }

  findByTokenHash(tokenHash: string): PasswordResetToken | null {
    const row = this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .get();
    return row ? toEntity(row) : null;
  }

  latestCreatedAtForUser(userId: string): Date | null {
    const row = this.db
      .select({ createdAt: passwordResetTokens.createdAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1)
      .get();
    return row ? parseIsoDate(row.createdAt, 'password_reset_tokens.created_at') : null;
  }

  invalidateAllForUser(userId: string, now: Date): void {
    this.db
      .update(passwordResetTokens)
      .set({ invalidatedAt: now.toISOString() })
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.invalidatedAt),
        ),
      )
      .run();
  }

  markUsed(id: string, now: Date): boolean {
    return (
      this.db
        .update(passwordResetTokens)
        .set({ usedAt: now.toISOString() })
        .where(
          and(
            eq(passwordResetTokens.id, id),
            isNull(passwordResetTokens.usedAt),
            isNull(passwordResetTokens.invalidatedAt),
          ),
        )
        .run().changes > 0
    );
  }

  deleteExpiredForUser(userId: string, now: Date): void {
    const threshold = new Date(now.getTime() - RESET_EMAIL_COOLDOWN_MS).toISOString();
    this.db
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), lt(passwordResetTokens.expiresAt, threshold)))
      .run();
  }
}

function toEntity(row: PasswordResetTokenRow): PasswordResetToken {
  return new PasswordResetToken({
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    createdAt: parseIsoDate(row.createdAt, 'password_reset_tokens.created_at'),
    expiresAt: parseIsoDate(row.expiresAt, 'password_reset_tokens.expires_at'),
    usedAt: row.usedAt === null ? null : parseIsoDate(row.usedAt, 'password_reset_tokens.used_at'),
    invalidatedAt:
      row.invalidatedAt === null ? null : parseIsoDate(row.invalidatedAt, 'password_reset_tokens.invalidated_at'),
  });
}
