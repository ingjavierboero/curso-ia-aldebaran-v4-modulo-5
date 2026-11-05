import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb, type Db } from '../../src/infrastructure/db/client.js';
import { migrate } from '../../src/infrastructure/db/migrate.js';

export interface TestDb {
  db: Db;
  /** Cierra la conexión y borra el directorio temporal. */
  cleanup(): void;
}

/** Base SQLite migrada en un directorio temporal propio; nunca toca `data/`. */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'aldebaran-test-'));
  const db = createDb(join(dir, 'test.db'));
  try {
    migrate(db);
  } catch (err) {
    db.$client.close();
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return {
    db,
    cleanup() {
      db.$client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
