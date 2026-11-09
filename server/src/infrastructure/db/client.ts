import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { findUp, isWorkspaceRoot } from './paths.js';
import { schema } from './schema.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export interface CreateDbOptions {
  /** Directorio de datos por defecto del repo. Por defecto, `dirname(resolveDatabasePath({}))`. */
  defaultDataDir?: string;
}

/**
 * Abre (o crea) la base SQLite en `path`. Sin efectos al importar: solo actúa al llamarla.
 * El directorio queda en 0700 solo si lo crea `createDb` o si es el de datos por defecto del repo;
 * cualquier otro directorio preexistente conserva sus permisos. El archivo y sus -wal/-shm, en 0600 (R-08).
 */
export function createDb(path: string, options: CreateDbOptions = {}): Db {
  const file = resolve(path);
  const dir = dirname(file);
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      chmodSync(dir, 0o700);
    } else {
      if (dir === (options.defaultDataDir !== undefined ? resolve(options.defaultDataDir) : repoDataDir())) {
        chmodSync(dir, 0o700);
      }
    }
    // crear el archivo ya con 0600 antes de que SQLite lo abra: sin ventana con el umask
    closeSync(openSync(file, 'a', 0o600));
    chmodSync(file, 0o600);
    // -wal y -shm que hayan quedado de antes; los nuevos heredan los permisos del archivo
    for (const sidecar of [`${file}-wal`, `${file}-shm`]) chmodIfExists(sidecar, 0o600);
    const sqlite = new Database(file);
    try {
      sqlite.pragma('journal_mode = WAL');
      sqlite.pragma('foreign_keys = ON');
    } catch (err) {
      sqlite.close();
      throw err;
    }
    return drizzle({ client: sqlite, schema });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`No se pudo abrir la base de datos en ${file}: ${reason}`, { cause: err });
  }
}

/** `<raíz del repo>/data`, o `undefined` si no hay raíz del monorepo (entonces no es el default). */
function repoDataDir(): string | undefined {
  try {
    return resolve(dirname(resolveDatabasePath({})));
  } catch {
    return undefined;
  }
}

/** `chmod` sin chequeo previo de existencia (sin TOCTOU): solo se ignora `ENOENT`. */
function chmodIfExists(target: string, mode: number): void {
  try {
    chmodSync(target, mode);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/**
 * `DATABASE_PATH` si está definida; si no, `<raíz del repo>/data/aldebaran.db`, donde la raíz es
 * el directorio cuyo `package.json` declara `workspaces`, subiendo desde `moduleUrl`.
 */
export function resolveDatabasePath(
  env: NodeJS.ProcessEnv = process.env,
  moduleUrl: string = import.meta.url,
): string {
  const fromEnv = env.DATABASE_PATH?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(findUp(moduleUrl, isWorkspaceRoot), 'data', 'aldebaran.db');
}
