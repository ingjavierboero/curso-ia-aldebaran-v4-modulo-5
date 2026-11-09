import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Session } from '../../src/domain/auth/Session.js';
import { Email } from '../../src/domain/user/Email.js';
import { User } from '../../src/domain/user/User.js';
import { DrizzleSessionRepository } from '../../src/infrastructure/db/DrizzleSessionRepository.js';
import { DrizzleUserRepository } from '../../src/infrastructure/db/DrizzleUserRepository.js';
import { createTestDb, type TestDb } from '../support/sqliteTestDb.js';

const CREATED = new Date('2026-11-04T12:00:00.000Z');

function seedUser(t: TestDb): void {
  new DrizzleUserRepository(t.db).insert(
    new User({
      id: 'u-1',
      name: 'Ana',
      email: Email.create('admin@empresa.com'),
      role: 'admin',
      status: 'activo',
      passwordHash: 'h',
      createdAt: CREATED,
    }),
  );
}

function makeSession(id = 's-1', tokenHash = 'a'.repeat(64)): Session {
  return new Session({ id, userId: 'u-1', tokenHash, createdAt: CREATED, lastActivityAt: CREATED });
}

describe('DrizzleSessionRepository', () => {
  let t: TestDb;

  beforeEach(() => {
    t = createTestDb();
    seedUser(t);
  });

  afterEach(() => {
    t.cleanup();
  });

  // DrizzleSessionRepository touch actualiza last_activity_at y delete la elimina
  it('test_drizzle_session_repository_touch_actualiza_y_delete_elimina', () => {
    const repo = new DrizzleSessionRepository(t.db);
    repo.insert(makeSession());

    const found = repo.findByTokenHash('a'.repeat(64));
    expect(found).toBeInstanceOf(Session);
    expect(found?.id).toBe('s-1');
    expect(found?.userId).toBe('u-1');
    expect(found?.createdAt.toISOString()).toBe('2026-11-04T12:00:00.000Z');
    expect(found?.lastActivityAt.toISOString()).toBe('2026-11-04T12:00:00.000Z');

    const later = new Date('2026-11-05T11:00:00.000Z');
    repo.touch('s-1', later);

    const touched = repo.findByTokenHash('a'.repeat(64));
    expect(touched?.lastActivityAt).toBeInstanceOf(Date);
    expect(touched?.lastActivityAt.toISOString()).toBe('2026-11-05T11:00:00.000Z');
    expect(touched?.createdAt.toISOString()).toBe('2026-11-04T12:00:00.000Z');
    const row = t.db.$client.prepare('SELECT last_activity_at FROM sessions WHERE id = ?').get('s-1') as {
      last_activity_at: string;
    };
    expect(row.last_activity_at).toBe('2026-11-05T11:00:00.000Z');

    repo.delete('s-1');

    expect(repo.findByTokenHash('a'.repeat(64))).toBeNull();
    expect(t.db.$client.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
    // borrar algo inexistente no lanza
    expect(() => repo.delete('s-1')).not.toThrow();
  });

  it('findByTokenHash lanza si last_activity_at o created_at no es un ISO 8601 válido (no hidrata Invalid Date)', () => {
    const repo = new DrizzleSessionRepository(t.db);
    repo.insert(makeSession('s-1', 'd'.repeat(64)));
    repo.insert(makeSession('s-2', 'e'.repeat(64)));
    t.db.$client.prepare("UPDATE sessions SET last_activity_at = 'no-es-una-fecha' WHERE id = 's-1'").run();
    t.db.$client.prepare("UPDATE sessions SET created_at = '' WHERE id = 's-2'").run();

    expect(() => repo.findByTokenHash('d'.repeat(64))).toThrow(/sessions\.last_activity_at.*no-es-una-fecha/);
    expect(() => repo.findByTokenHash('e'.repeat(64))).toThrow(/sessions\.created_at/);
  });

  it('findByTokenHash devuelve null para un hash desconocido y token_hash es único', () => {
    const repo = new DrizzleSessionRepository(t.db);
    repo.insert(makeSession('s-1', 'b'.repeat(64)));

    expect(repo.findByTokenHash('c'.repeat(64))).toBeNull();
    expect(() => repo.insert(makeSession('s-2', 'b'.repeat(64)))).toThrow();
    expect(t.db.$client.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 });
  });
});
