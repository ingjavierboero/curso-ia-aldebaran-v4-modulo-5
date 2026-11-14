import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteDatabaseProbe } from '../../src/infrastructure/db/SqliteDatabaseProbe.js';
import { createTestDb, type TestDb } from '../support/sqliteTestDb.js';

describe('SqliteDatabaseProbe', () => {
  let t: TestDb;
  let probe: SqliteDatabaseProbe | null;

  beforeEach(() => {
    t = createTestDb();
    probe = null;
  });

  afterEach(() => {
    probe?.close();
    t.cleanup();
  });

  it('informa disponible una base sana', () => {
    probe = new SqliteDatabaseProbe(t.db.$client.name);

    expect(probe.isAvailable()).toBe(true);
  });

  // AC-14 / NFR-01: con un lock exclusivo tomado por otra conexión, false en menos de 1 s
  it('test_probe_base_bloqueada_no_disponible_en_menos_de_un_segundo', () => {
    probe = new SqliteDatabaseProbe(t.db.$client.name);
    const locker = t.db.$client;
    locker.pragma('locking_mode = EXCLUSIVE');
    locker.exec('BEGIN EXCLUSIVE');
    locker.exec("CREATE TABLE lock_probe (x INTEGER); INSERT INTO lock_probe VALUES (1)");

    try {
      const started = performance.now();
      const available = probe.isAvailable();
      const elapsed = performance.now() - started;

      expect(available).toBe(false);
      expect(elapsed).toBeLessThan(1000);
    } finally {
      locker.exec('ROLLBACK');
      locker.pragma('locking_mode = NORMAL');
    }
  });

  it('informa no disponible un archivo inexistente, sin crearlo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aldebaran-probe-'));
    const missing = join(dir, 'no-existe.db');
    try {
      probe = new SqliteDatabaseProbe(missing);
      expect(probe.isAvailable()).toBe(false);
      expect(existsSync(missing)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('un archivo que faltaba y después aparece: el siguiente sondeo da true', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aldebaran-probe-'));
    const later = join(dir, 'despues.db');
    try {
      probe = new SqliteDatabaseProbe(later);
      expect(probe.isAvailable()).toBe(false);

      const created = new Database(later);
      created.exec('CREATE TABLE t (x INTEGER)');
      created.close();

      expect(probe.isAvailable()).toBe(true);
    } finally {
      probe?.close();
      probe = null;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tras un error cierra la conexión y, liberado el lock, el siguiente sondeo la reabre y da true', () => {
    // el lock se toma antes del primer sondeo: con la conexión del sondeo ya abierta en WAL, el
    // modo EXCLUSIVE del otro lado no se puede tomar
    probe = new SqliteDatabaseProbe(t.db.$client.name);
    const closeSpy = vi.spyOn(Database.prototype, 'close');
    const locker = t.db.$client;
    locker.pragma('locking_mode = EXCLUSIVE');
    locker.exec('BEGIN EXCLUSIVE');
    locker.exec('CREATE TABLE lock_probe (x INTEGER); INSERT INTO lock_probe VALUES (1)');
    try {
      expect(probe.isAvailable()).toBe(false);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      closeSpy.mockRestore();
      locker.exec('ROLLBACK');
      locker.pragma('locking_mode = NORMAL');
      // el lock exclusivo se suelta en el siguiente acceso con el modo NORMAL
      locker.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
    }

    expect(probe.isAvailable()).toBe(true);
  });

  it('después de close() el siguiente sondeo reabre la conexión y da true', () => {
    probe = new SqliteDatabaseProbe(t.db.$client.name);
    expect(probe.isAvailable()).toBe(true);

    probe.close();

    expect(probe.isAvailable()).toBe(true);
  });
});
