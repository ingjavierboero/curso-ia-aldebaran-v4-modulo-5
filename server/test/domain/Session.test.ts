import { describe, expect, it } from 'vitest';
import { Session, SESSION_IDLE_TIMEOUT_MS } from '../../src/domain/auth/Session.js';

const last = new Date('2026-11-04T12:00:00.000Z');
const session = new Session({ id: 's-1', userId: 'u-1', tokenHash: 'h', createdAt: last, lastActivityAt: last });

describe('Session', () => {
  it('Session.isExpired vence a las 24 h exactas sin actividad y no un milisegundo antes', () => {
    expect(session.isExpired(new Date(last.getTime() + SESSION_IDLE_TIMEOUT_MS))).toBe(true);
    expect(session.isExpired(new Date(last.getTime() + SESSION_IDLE_TIMEOUT_MS - 1))).toBe(false);
  });

  it('Session copia las fechas: mutar la Date pasada al constructor no cambia la sesión', () => {
    const at = new Date('2026-11-04T12:00:00.000Z');
    const s = new Session({ id: 's-2', userId: 'u-1', tokenHash: 'h2', createdAt: at, lastActivityAt: at });

    at.setTime(0);

    expect(s.createdAt.toISOString()).toBe('2026-11-04T12:00:00.000Z');
    expect(s.lastActivityAt.toISOString()).toBe('2026-11-04T12:00:00.000Z');
  });

  it('Session no comparte la misma instancia entre createdAt y lastActivityAt', () => {
    const at = new Date('2026-11-04T12:00:00.000Z');
    const s = new Session({ id: 's-3', userId: 'u-1', tokenHash: 'h3', createdAt: at, lastActivityAt: at });

    expect(s.createdAt).not.toBe(s.lastActivityAt);
    expect(s.createdAt).toEqual(s.lastActivityAt);
  });
});
