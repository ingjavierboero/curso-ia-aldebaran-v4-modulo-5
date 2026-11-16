import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../src/infrastructure/db/client.js';
import { migrate } from '../../src/infrastructure/db/migrate.js';

describe('base de datos', () => {
  let workDir: string;
  const opened: Db[] = [];

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'aldebaran-db-'));
  });

  afterEach(() => {
    for (const db of opened.splice(0)) db.$client.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  // migrate crea las tablas users y sessions con sus índices únicos
  it('test_migrate_crea_tablas_users_y_sessions_con_indices_unicos', () => {
    const db = createDb(join(workDir, 'aldebaran.db'));
    opened.push(db);

    migrate(db);

    const sqlite = db.$client;
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users','sessions') ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(['sessions', 'users']);

    const userIndexes = sqlite.prepare("PRAGMA index_list('users')").all() as { name: string; unique: number }[];
    const userUnique = userIndexes.filter((i) => i.unique === 1).flatMap((i) =>
      (sqlite.prepare(`PRAGMA index_info('${i.name}')`).all() as { name: string }[]).map((c) => c.name),
    );
    expect(userUnique).toContain('email');

    const sessionIndexes = sqlite.prepare("PRAGMA index_list('sessions')").all() as { name: string; unique: number }[];
    const sessionCols = (unique: number) =>
      sessionIndexes.filter((i) => i.unique === unique && !i.name.startsWith('sqlite_autoindex_sessions_1')).flatMap((i) =>
        (sqlite.prepare(`PRAGMA index_info('${i.name}')`).all() as { name: string }[]).map((c) => c.name),
      );
    expect(sessionCols(1)).toContain('token_hash');
    expect(sessionCols(0)).toContain('user_id');

    const fks = sqlite.prepare("PRAGMA foreign_key_list('sessions')").all() as {
      table: string; from: string; to: string; on_delete: string;
    }[];
    expect(fks).toEqual([expect.objectContaining({ table: 'users', from: 'user_id', to: 'id', on_delete: 'CASCADE' })]);

    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);

    // CHECK de role y status, default de status
    const insert = sqlite.prepare(
      "INSERT INTO users (id, name, email, role, password_hash, created_at) VALUES (?, 'N', ?, ?, 'h', '2026-11-04T00:00:00.000Z')",
    );
    insert.run('u1', 'a@b.co', 'admin');
    expect((sqlite.prepare("SELECT status FROM users WHERE id = 'u1'").get() as { status: string }).status).toBe('activo');
    expect(() => insert.run('u2', 'c@d.co', 'superadmin')).toThrow(/CHECK/);
    expect(() => insert.run('u3', 'a@b.co', 'editor')).toThrow(/UNIQUE/);
  });

  // migrate crea job_runs con NOT NULL en todas las columnas y el índice (job_name, outcome, finished_at)
  it('migrate crea la tabla job_runs con su índice compuesto', () => {
    const db = createDb(join(workDir, 'aldebaran.db'));
    opened.push(db);

    migrate(db);

    const sqlite = db.$client;
    const columns = sqlite.prepare("PRAGMA table_info('job_runs')").all() as {
      name: string; type: string; notnull: number; pk: number;
    }[];
    expect(columns.map((c) => [c.name, c.type.toLowerCase(), c.notnull, c.pk])).toEqual([
      ['id', 'text', 1, 1],
      ['job_name', 'text', 1, 0],
      ['started_at', 'text', 1, 0],
      ['finished_at', 'text', 1, 0],
      ['outcome', 'text', 1, 0],
    ]);

    const indexes = sqlite.prepare("PRAGMA index_list('job_runs')").all() as { name: string; unique: number }[];
    const composite = indexes.find((i) => i.name === 'job_runs_job_outcome_finished_idx');
    expect(composite?.unique).toBe(0);
    const indexCols = (sqlite.prepare("PRAGMA index_info('job_runs_job_outcome_finished_idx')").all() as {
      name: string;
    }[]).map((c) => c.name);
    expect(indexCols).toEqual(['job_name', 'outcome', 'finished_at']);
  });

  // AC-09: la base rechaza por CHECK un outcome fuera de 'ok'/'error'
  it('test_outcome_invalido_rechazado_por_la_base', () => {
    const db = createDb(join(workDir, 'aldebaran.db'));
    opened.push(db);

    migrate(db);

    const sqlite = db.$client;
    const insert = sqlite.prepare(
      "INSERT INTO job_runs (id, job_name, started_at, finished_at, outcome) VALUES (?, 'facturacion', '2026-11-14T10:00:00.000Z', '2026-11-14T10:00:01.000Z', ?)",
    );
    insert.run('r-ok', 'ok');
    insert.run('r-error', 'error');
    expect(() => insert.run('r-1', 'fallido')).toThrow(/CHECK/);
    expect(() => insert.run('r-2', 'OK')).toThrow(/CHECK/);
    expect(() => insert.run('r-3', '')).toThrow(/CHECK/);
    expect(() => insert.run('r-4', null)).toThrow(/NOT NULL/);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM job_runs').get()).toEqual({ n: 2 });
  });

  // FEAT-008: password_reset_tokens con token_hash UNIQUE, índice por usuario y FK en cascada
  it('test_migracion_password_reset_tokens', () => {
    const db = createDb(join(workDir, 'aldebaran.db'));
    opened.push(db);

    migrate(db);

    const sqlite = db.$client;
    const columns = sqlite.prepare("PRAGMA table_info('password_reset_tokens')").all() as {
      name: string; type: string; notnull: number; pk: number;
    }[];
    expect(columns.map((c) => [c.name, c.type.toLowerCase(), c.notnull, c.pk])).toEqual([
      ['id', 'text', 1, 1],
      ['user_id', 'text', 1, 0],
      ['token_hash', 'text', 1, 0],
      ['created_at', 'text', 1, 0],
      ['expires_at', 'text', 1, 0],
      ['used_at', 'text', 0, 0],
      ['invalidated_at', 'text', 0, 0],
    ]);

    const indexes = sqlite.prepare("PRAGMA index_list('password_reset_tokens')").all() as { name: string; unique: number }[];
    const colsOf = (name: string) =>
      (sqlite.prepare(`PRAGMA index_info('${name}')`).all() as { name: string }[]).map((c) => c.name);
    const uniqueCols = indexes.filter((i) => i.unique === 1).flatMap((i) => colsOf(i.name));
    expect(uniqueCols).toContain('token_hash');
    const userIdx = indexes.find((i) => i.name === 'password_reset_tokens_user_id_idx');
    expect(userIdx?.unique).toBe(0);
    expect(colsOf('password_reset_tokens_user_id_idx')).toEqual(['user_id']);

    const fks = sqlite.prepare("PRAGMA foreign_key_list('password_reset_tokens')").all() as {
      table: string; from: string; to: string; on_delete: string;
    }[];
    expect(fks).toEqual([expect.objectContaining({ table: 'users', from: 'user_id', to: 'id', on_delete: 'CASCADE' })]);

    // borrar el usuario borra sus tokens
    sqlite
      .prepare("INSERT INTO users (id, name, email, role, password_hash, created_at) VALUES (?, 'N', ?, 'admin', 'h', '2026-11-16T00:00:00.000Z')")
      .run('u1', 'a@b.co');
    const insertToken = sqlite.prepare(
      "INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at) VALUES (?, 'u1', ?, '2026-11-16T12:00:00.000Z', '2026-11-16T12:10:00.000Z')",
    );
    insertToken.run('t1', 'a'.repeat(64));
    insertToken.run('t2', 'b'.repeat(64));
    expect(() => insertToken.run('t3', 'a'.repeat(64))).toThrow(/UNIQUE/);
    sqlite.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').get()).toEqual({ n: 0 });
  });

  // createDb crea el directorio faltante con permisos 0700 y el archivo con 0600
  it('test_createdb_crea_directorio_0700_y_archivo_0600', () => {
    const dir = join(workDir, 'nested', 'data');
    const file = join(dir, 'aldebaran.db');

    const db = createDb(file);
    opened.push(db);

    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('createDb deja en 0700 un directorio preexistente y en 0600 los -wal/-shm preexistentes', () => {
    const dir = join(workDir, 'data');
    mkdirSync(dir, { mode: 0o755 });
    chmodSync(dir, 0o755);
    const file = join(dir, 'aldebaran.db');
    for (const suffix of ['-wal', '-shm']) {
      writeFileSync(`${file}${suffix}`, '', { mode: 0o644 });
      chmodSync(`${file}${suffix}`, 0o644);
    }

    // `dir` hace de directorio de datos por defecto del repo (`<raíz>/data`)
    const db = createDb(file, { defaultDataDir: dir });
    opened.push(db);

    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(`${file}-wal`).mode & 0o777).toBe(0o600);
    expect(statSync(`${file}-shm`).mode & 0o777).toBe(0o600);
  });

  it('createDb no toca los permisos de un directorio preexistente que no es el de datos por defecto', () => {
    const dir = join(workDir, 'ajeno');
    mkdirSync(dir, { mode: 0o755 });
    chmodSync(dir, 0o755);
    const file = join(dir, 'aldebaran.db');

    const db = createDb(file, { defaultDataDir: join(workDir, 'data') });
    opened.push(db);

    expect(statSync(dir).mode & 0o777).toBe(0o755);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  // createDb con ruta no creable lanza error con la ruta (error)
  it('test_createdb_con_ruta_no_creable_lanza_error_con_la_ruta', () => {
    // un archivo regular en el medio de la ruta: mkdir falla con ENOTDIR, incluso corriendo como root
    const blocker = join(workDir, 'un-archivo');
    writeFileSync(blocker, '');
    const file = join(blocker, 'sub', 'aldebaran.db');

    expect(() => createDb(file)).toThrow(file);
  });
});

