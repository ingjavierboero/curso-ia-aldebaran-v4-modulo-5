import { describe, expect, it } from 'vitest';
import {
  canIssueResetToken,
  PasswordResetToken,
  type PasswordResetTokenProps,
  RESET_EMAIL_COOLDOWN_MS,
  RESET_TOKEN_TTL_MS,
} from '../../src/domain/auth/PasswordResetToken.js';

const MIN = 60_000;
const now = new Date('2026-11-16T12:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms);

function issued(): PasswordResetToken {
  return PasswordResetToken.issue({ id: 't-1', userId: 'u-1', tokenHash: 'a'.repeat(64), now });
}

function propsOf(t: PasswordResetToken): PasswordResetTokenProps {
  return {
    id: t.id,
    userId: t.userId,
    tokenHash: t.tokenHash,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt,
    usedAt: t.usedAt,
    invalidatedAt: t.invalidatedAt,
  };
}

describe('PasswordResetToken', () => {
  it('test_reset_token_usable_a_los_9_minutos', () => {
    const token = issued();

    expect(RESET_TOKEN_TTL_MS).toBe(10 * MIN);
    expect(token.createdAt.toISOString()).toBe(now.toISOString());
    expect(token.expiresAt.toISOString()).toBe(at(10 * MIN).toISOString());
    expect(token.usedAt).toBeNull();
    expect(token.invalidatedAt).toBeNull();
    expect(token.isUsable(now)).toBe(true);
    expect(token.isUsable(at(9 * MIN))).toBe(true);
    expect(token.isUsable(at(10 * MIN - 1))).toBe(true);
  });

  it('test_reset_token_vencido_a_los_10_minutos_invalido', () => {
    const token = issued();

    expect(token.isUsable(at(10 * MIN))).toBe(false);
    expect(token.isUsable(at(11 * MIN))).toBe(false);
  });

  it('test_reset_token_usado_invalido', () => {
    const token = new PasswordResetToken({ ...propsOf(issued()), usedAt: at(1 * MIN) });

    expect(token.usedAt?.toISOString()).toBe(at(1 * MIN).toISOString());
    expect(token.isUsable(at(2 * MIN))).toBe(false);
  });

  it('test_reset_token_anulado_invalido', () => {
    const token = new PasswordResetToken({ ...propsOf(issued()), invalidatedAt: at(1 * MIN) });

    expect(token.invalidatedAt?.toISOString()).toBe(at(1 * MIN).toISOString());
    expect(token.isUsable(at(2 * MIN))).toBe(false);
  });

  it('test_can_issue_reset_token_respeta_5_minutos', () => {
    expect(RESET_EMAIL_COOLDOWN_MS).toBe(5 * MIN);

    expect(canIssueResetToken(now, at(5 * MIN - 1_000))).toBe(false);
    expect(canIssueResetToken(now, at(5 * MIN))).toBe(true);
    expect(canIssueResetToken(null, now)).toBe(true);
  });

  it('copia las fechas: mutar la Date pasada no cambia el token', () => {
    const when = new Date(now.getTime());
    const token = PasswordResetToken.issue({ id: 't-2', userId: 'u-1', tokenHash: 'b'.repeat(64), now: when });

    when.setTime(0);

    expect(token.createdAt.toISOString()).toBe(now.toISOString());
    expect(token.expiresAt.toISOString()).toBe(at(10 * MIN).toISOString());
  });
});
