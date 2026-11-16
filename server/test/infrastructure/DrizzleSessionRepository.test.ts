import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Session } from '../../src/domain/auth/Session.js';
import { Email } from '../../src/domain/shared/Email.js';
import { User } from '../../src/domain/user/User.js';
import { DrizzleSessionRepository } from '../../src/infrastructure/db/DrizzleSessionRepository.js';
import { DrizzleUserRepository } from '../../src/infrastructure/db/DrizzleUserRepository.js';
import { createTestDb, type TestDb } from '../support/sqliteTestDb.js';

const CREATED = new Date('2026-11-04T12:00:00.000Z');

function seedUser(t: TestDb, id = 'u-1', email = 'admin@empresa.com'): void {
  new DrizzleUserRepository(t.db).insert(
    new User({
      id,
      name: 'Ana',
      email: Email.create(email),
      role: 'admin',
      status: 'activo',
      passwordHash: 'h',
      createdAt: CREATED,
    }),
  );
}

function makeSession(id = 's-1', tokenHash = 'a'.repeat(64), userId = 'u-1'): Session {
  return new Session({ id, userId, tokenHash, createdAt: CREATED, lastActivityAt: CREATED });
}

function sessionIds(t: TestDb): string[] {
  const rows = t.db.$client.prepare('SELECT id FROM sessions ORDER BY id').all() as { id: string }[];
  return rows.map((r) => r.id);
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
    expect(() => { repo.delete('s-1'); }).not.toThrow();
  });

  // FEAT-006 (FR-07): deleteByUserId borra todas las sesiones del usuario, solo las suyas, y devuelve cuántas
  it('test_session_repository_delete_by_user_id_borra_solo_las_suyas', () => {
    seedUser(t, 'u-2', 'otro@empresa.com');
    const repo = new DrizzleSessionRepository(t.db);
    repo.insert(makeSession('s-1', '1'.repeat(64), 'u-1'));
    repo.insert(makeSession('s-2', '2'.repeat(64), 'u-1'));
    repo.insert(makeSession('s-3', '3'.repeat(64), 'u-2'));

    expect(repo.deleteByUserId('u-1')).toBe(2);

    expect(sessionIds(t)).toEqual(['s-3']);
    expect(repo.findByTokenHash('1'.repeat(64))).toBeNull();
    expect(repo.findByTokenHash('3'.repeat(64))?.userId).toBe('u-2');
    // sin sesiones (o usuario inexistente) no lanza y devuelve 0
    expect(repo.deleteByUserId('u-1')).toBe(0);
    expect(repo.deleteByUserId('no-existe')).toBe(0);
  });

  // FEAT-007 (FR-07, AC-09): borra las demás sesiones del usuario, conserva la indicada y no toca las de otros
  it('test_drizzle_delete_by_user_id_except_conserva_la_actual', () => {
    seedUser(t, 'u-2', 'otro@empresa.com');
    const repo = new DrizzleSessionRepository(t.db);
    repo.insert(makeSession('s-1', '1'.repeat(64), 'u-1'));
    repo.insert(makeSession('s-2', '2'.repeat(64), 'u-1'));
    repo.insert(makeSession('s-3', '3'.repeat(64), 'u-1'));
    repo.insert(makeSession('s-4', '4'.repeat(64), 'u-2'));

    expect(repo.deleteByUserIdExcept('u-1', 's-2')).toBe(2);

    expect(sessionIds(t)).toEqual(['s-2', 's-4']);
    expect(repo.findByTokenHash('2'.repeat(64))?.userId).toBe('u-1');
    expect(repo.findByTokenHash('4'.repeat(64))?.userId).toBe('u-2');
    // solo queda la conservada: no borra nada más
    expect(repo.deleteByUserIdExcept('u-1', 's-2')).toBe(0);
    // una sesión de otro usuario como "conservada" no protege nada del usuario ni borra la ajena
    expect(repo.deleteByUserIdExcept('u-1', 's-4')).toBe(1);
    expect(sessionIds(t)).toEqual(['s-4']);
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
    expect(() => { repo.insert(makeSession('s-2', 'b'.repeat(64))); }).toThrow();
    expect(t.db.$client.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 });
  });
});
