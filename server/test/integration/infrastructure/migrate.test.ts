import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../../src/infrastructure/db/client.js';
import { migrate } from '../../../src/infrastructure/db/migrate.js';

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

  // FEAT-010: clients, products y client_products con sus UNIQUE, CHECK, FK y PK compuesta
  it('test_migracion_clientes_productos', () => {
    const db = createDb(join(workDir, 'aldebaran.db'));
    opened.push(db);

    migrate(db);

    const sqlite = db.$client;
    type Column = { name: string; type: string; notnull: number; pk: number };
    const columnsOf = (table: string) =>
      (sqlite.prepare(`PRAGMA table_info('${table}')`).all() as Column[]).map((c) => [
        c.name,
        c.type.toLowerCase(),
        c.notnull,
        c.pk,
      ]);
    const indexesOf = (table: string) =>
      sqlite.prepare(`PRAGMA index_list('${table}')`).all() as { name: string; unique: number; origin: string }[];
    const colsOf = (index: string) =>
      (sqlite.prepare(`PRAGMA index_info('${index}')`).all() as { name: string }[]).map((c) => c.name);
    const uniqueSingleCols = (table: string) =>
      indexesOf(table)
        .filter((i) => i.unique === 1 && i.origin !== 'pk')
        .map((i) => colsOf(i.name))
        .filter((cols) => cols.length === 1)
        .map((cols) => cols[0]);

    expect(columnsOf('clients')).toEqual([
      ['id', 'text', 1, 1],
      ['business_name', 'text', 1, 0],
      ['cuit', 'text', 1, 0],
      ['address', 'text', 1, 0],
      ['billing_email', 'text', 1, 0],
      ['iva_condition', 'integer', 1, 0],
      ['status', 'text', 1, 0],
      ['created_at', 'text', 1, 0],
    ]);
    const clientUnique = uniqueSingleCols('clients');
    expect(clientUnique).toHaveLength(2);
    expect(clientUnique).toEqual(expect.arrayContaining(['cuit', 'billing_email']));

    expect(columnsOf('products')).toEqual([
      ['id', 'text', 1, 1],
      ['name', 'text', 1, 0],
      ['name_normalized', 'text', 1, 0],
      ['price_cents', 'integer', 1, 0],
      ['currency', 'text', 1, 0],
      ['status', 'text', 1, 0],
      ['created_at', 'text', 1, 0],
    ]);
    expect(uniqueSingleCols('products')).toEqual(['name_normalized']);

    // PK compuesta (client_id, product_id) e índice no único en product_id
    expect(columnsOf('client_products')).toEqual([
      ['client_id', 'text', 1, 1],
      ['product_id', 'text', 1, 2],
      ['created_at', 'text', 1, 0],
    ]);
    const cpIndexes = indexesOf('client_products');
    const pk = cpIndexes.find((i) => i.origin === 'pk');
    expect(pk && colsOf(pk.name)).toEqual(['client_id', 'product_id']);
    const byProduct = cpIndexes.filter((i) => i.origin === 'c' && i.unique === 0).map((i) => colsOf(i.name));
    expect(byProduct).toEqual([['product_id']]);

    const fks = sqlite.prepare("PRAGMA foreign_key_list('client_products')").all() as {
      table: string; from: string; to: string; on_delete: string;
    }[];
    expect(fks).toHaveLength(2);
    expect(fks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'clients', from: 'client_id', to: 'id', on_delete: 'NO ACTION' }),
        expect.objectContaining({ table: 'products', from: 'product_id', to: 'id', on_delete: 'NO ACTION' }),
      ]),
    );

    // CHECK y UNIQUE de clients
    const insertClient = sqlite.prepare(
      "INSERT INTO clients (id, business_name, cuit, address, billing_email, iva_condition, status, created_at) VALUES (?, 'R', ?, 'D', ?, ?, ?, '2026-11-16T00:00:00.000Z')",
    );
    insertClient.run('c1', '30711111111', 'a@b.co', 1, 'activo');
    for (const code of [4, 5, 6, 7, 8, 9, 10, 13, 15, 16]) {
      insertClient.run(`c-iva-${String(code)}`, `cuit-${String(code)}`, `${String(code)}@b.co`, code, 'inactivo');
    }
    expect(() => insertClient.run('c2', '20123456786', 'x@b.co', 2, 'activo')).toThrow(/CHECK/);
    expect(() => insertClient.run('c3', '20123456786', 'x@b.co', 99, 'activo')).toThrow(/CHECK/);
    expect(() => insertClient.run('c4', '20123456786', 'x@b.co', 1, 'baja')).toThrow(/CHECK/);
    expect(() => insertClient.run('c5', '30711111111', 'x@b.co', 1, 'activo')).toThrow(/UNIQUE/);
    expect(() => insertClient.run('c6', '20123456786', 'a@b.co', 1, 'activo')).toThrow(/UNIQUE/);
    expect(() => insertClient.run('c7', null, 'y@b.co', 1, 'activo')).toThrow(/NOT NULL/);

    // CHECK y UNIQUE de products
    const insertProduct = sqlite.prepare(
      "INSERT INTO products (id, name, name_normalized, price_cents, currency, status, created_at) VALUES (?, 'N', ?, ?, ?, ?, '2026-11-16T00:00:00.000Z')",
    );
    insertProduct.run('p1', 'n1', 1, 'ARS', 'activo');
    insertProduct.run('p2', 'n2', 99_999_999_999, 'USD', 'inactivo');
    expect(() => insertProduct.run('p3', 'n3', 0, 'ARS', 'activo')).toThrow(/CHECK/);
    expect(() => insertProduct.run('p4', 'n4', -100, 'ARS', 'activo')).toThrow(/CHECK/);
    expect(() => insertProduct.run('p5', 'n5', 100, 'EUR', 'activo')).toThrow(/CHECK/);
    expect(() => insertProduct.run('p6', 'n6', 100, 'ARS', 'baja')).toThrow(/CHECK/);
    expect(() => insertProduct.run('p7', 'n1', 100, 'ARS', 'activo')).toThrow(/UNIQUE/);

    // PK compuesta y FK de client_products
    const assign = sqlite.prepare(
      "INSERT INTO client_products (client_id, product_id, created_at) VALUES (?, ?, '2026-11-16T00:00:00.000Z')",
    );
    assign.run('c1', 'p1');
    assign.run('c1', 'p2');
    expect(() => assign.run('c1', 'p1')).toThrow(/UNIQUE constraint failed: client_products\.client_id, client_products\.product_id/);
    expect(() => assign.run('c1', 'no-existe')).toThrow(/FOREIGN KEY/);
    expect(() => assign.run('no-existe', 'p1')).toThrow(/FOREIGN KEY/);
    // sin ON DELETE: no se puede borrar un cliente o producto con asignaciones
    expect(() => sqlite.prepare("DELETE FROM clients WHERE id = 'c1'").run()).toThrow(/FOREIGN KEY/);
    expect(() => sqlite.prepare("DELETE FROM products WHERE id = 'p1'").run()).toThrow(/FOREIGN KEY/);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM client_products').get()).toEqual({ n: 2 });
  });

  // FEAT-011: settings de una sola fila, con los CHECK derivados del dominio (ADR-008)
  it('test_migracion_settings_check_invalido_rechazado', () => {
    const db = createDb(join(workDir, 'aldebaran.db'));
    opened.push(db);

    migrate(db);

    const sqlite = db.$client;
    const columns = sqlite.prepare("PRAGMA table_info('settings')").all() as {
      name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
    }[];
    expect(columns.map((c) => [c.name, c.type.toLowerCase(), c.notnull, c.dflt_value, c.pk])).toEqual([
      ['id', 'integer', 1, null, 1],
      ['billing_hour', 'text', 1, null, 0],
      ['point_of_sale', 'integer', 0, null, 0],
      ['issuer_legal_name', 'text', 0, null, 0],
      ['issuer_address', 'text', 0, null, 0],
      ['issuer_iva_condition', 'integer', 0, null, 0],
      ['issuer_iibb', 'text', 0, null, 0],
      ['issuer_activity_start', 'text', 0, null, 0],
      ['issuer_trade_name', 'text', 0, null, 0],
      ['updated_at', 'text', 1, null, 0],
    ]);
    // sin índices adicionales: se lee por clave primaria
    expect(sqlite.prepare("PRAGMA index_list('settings')").all()).toEqual([]);

    const insert = sqlite.prepare(
      'INSERT INTO settings (id, billing_hour, point_of_sale, issuer_legal_name, issuer_address, issuer_iva_condition, issuer_iibb, issuer_activity_start, issuer_trade_name, updated_at) ' +
        "VALUES (@id, @hour, @pos, @legal, @address, @iva, @iibb, @start, @trade, '2026-11-16T00:00:00.000Z')",
    );
    const valid = {
      id: 1, hour: '11:00', pos: 1, legal: 'R', address: 'D', iva: 4, iibb: 'I', start: '2020-01-01', trade: 'F',
    };
    const rejected = (overrides: Record<string, unknown>, pattern: RegExp): void => {
      expect(() => insert.run({ ...valid, ...overrides })).toThrow(pattern);
    };

    // la única fila admitida es la 1
    rejected({ id: 2 }, /CHECK/);
    rejected({ id: 0 }, /CHECK/);
    // punto de venta 1–99999
    rejected({ pos: 0 }, /CHECK/);
    rejected({ pos: 100000 }, /CHECK/);
    // condición frente al IVA de la empresa emisora: 4, 6, 13 o 16
    for (const iva of [1, 5, 7, 99]) rejected({ iva }, /CHECK/);
    // hora HH:MM hasta 23:59, obligatoria
    for (const hour of ['24:00', '25:00', '11:60', '9:00', '11:00:00', 'ab:cd', '']) rejected({ hour }, /CHECK/);
    rejected({ hour: null }, /NOT NULL/);
    // largos de los textos
    for (const field of ['legal', 'address', 'trade']) {
      rejected({ [field]: '' }, /CHECK/);
      rejected({ [field]: 'x'.repeat(201) }, /CHECK/);
    }
    rejected({ iibb: '' }, /CHECK/);
    rejected({ iibb: 'x'.repeat(51) }, /CHECK/);
    // fecha YYYY-MM-DD
    for (const start of ['2020-1-01', '01/01/2020', '2020-01-01T00:00']) rejected({ start }, /CHECK/);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 0 });

    // los límites y cada condición admitida pasan; los opcionales aceptan NULL
    insert.run({ ...valid, hour: '23:59', pos: 99999, legal: 'x'.repeat(200), iibb: 'y'.repeat(50) });
    for (const iva of [6, 13, 16]) {
      sqlite.prepare('UPDATE settings SET issuer_iva_condition = ? WHERE id = 1').run(iva);
    }
    sqlite
      .prepare(
        "UPDATE settings SET billing_hour = '00:00', point_of_sale = NULL, issuer_legal_name = NULL, issuer_address = NULL, issuer_iva_condition = NULL, issuer_iibb = NULL, issuer_activity_start = NULL, issuer_trade_name = NULL WHERE id = 1",
      )
      .run();
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 1 });
  });

  // FEAT-011: la migración 0004 corre sobre una base que ya tiene datos de FEAT-010 y no los toca.
  // Depende del formato de `meta/_journal.json` de drizzle-kit y de que el migrador aplique por
  // `when` y no por hash: si falla tras actualizar drizzle-orm, mirar ahí primero (W4, Block 2).
  it('la migración de settings corre sobre una base con clientes y productos', () => {
    const drizzleDir = fileURLToPath(new URL('../../../drizzle', import.meta.url));
    const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta', '_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const upToFeat010 = journal.entries.filter((e) => e.idx <= 3);
    expect(upToFeat010.map((e) => e.tag)).toContain('0003_fluffy_black_cat');
    // copia de las migraciones hasta la 0003, como estaba la base antes de FEAT-011
    const oldMigrations = join(workDir, 'drizzle-0003');
    mkdirSync(join(oldMigrations, 'meta'), { recursive: true });
    for (const entry of upToFeat010) copyFileSync(join(drizzleDir, `${entry.tag}.sql`), join(oldMigrations, `${entry.tag}.sql`));
    writeFileSync(join(oldMigrations, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: upToFeat010 }));

    const db = createDb(join(workDir, 'aldebaran.db'));
    opened.push(db);
    drizzleMigrate(db, { migrationsFolder: oldMigrations });
    const sqlite = db.$client;
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'").all()).toEqual([]);
    sqlite
      .prepare(
        "INSERT INTO clients (id, business_name, cuit, address, billing_email, iva_condition, status, created_at) VALUES ('c1', 'R', '30711111111', 'D', 'a@b.co', 1, 'activo', '2026-11-16T00:00:00.000Z')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO products (id, name, name_normalized, price_cents, currency, status, created_at) VALUES ('p1', 'N', 'n', 100, 'ARS', 'activo', '2026-11-16T00:00:00.000Z')",
      )
      .run();
    sqlite.prepare("INSERT INTO client_products (client_id, product_id, created_at) VALUES ('c1', 'p1', '2026-11-16T00:00:00.000Z')").run();

    migrate(db);

    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'").all()).toEqual([
      { name: 'settings' },
    ]);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT id FROM clients').all()).toEqual([{ id: 'c1' }]);
    expect(sqlite.prepare('SELECT id FROM products').all()).toEqual([{ id: 'p1' }]);
    expect(sqlite.prepare('SELECT client_id, product_id FROM client_products').all()).toEqual([
      { client_id: 'c1', product_id: 'p1' },
    ]);
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

