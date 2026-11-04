import { join } from 'node:path';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './client.js';
import { findUp } from './paths.js';

/** Aplica las migraciones de `server/drizzle/`. Explícita: nada se migra al importar. */
export function migrate(db: Db): void {
  const migrationsFolder = join(findUp(import.meta.url, join('drizzle', 'meta', '_journal.json')), 'drizzle');
  drizzleMigrate(db, { migrationsFolder });
}
