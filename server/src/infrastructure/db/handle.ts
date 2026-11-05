import type { RunResult } from 'better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { schema } from './schema.js';

/**
 * Handle síncrono de Drizzle sobre better-sqlite3: la base (`Db`) o una transacción abierta
 * por `DrizzleUnitOfWork`. Los repositorios funcionan igual sobre cualquiera de los dos.
 */
export type SqliteHandle = BaseSQLiteDatabase<'sync', RunResult, typeof schema>;
