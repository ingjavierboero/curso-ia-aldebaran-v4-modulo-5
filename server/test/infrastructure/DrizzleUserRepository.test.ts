import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstAdminAlreadyExists } from '../../src/application/auth/errors.js';
import { Email } from '../../src/domain/user/Email.js';
import { User } from '../../src/domain/user/User.js';
import { DrizzleUserRepository } from '../../src/infrastructure/db/DrizzleUserRepository.js';
import { createTestDb, type TestDb } from '../support/sqliteTestDb.js';

function makeUser(overrides: Partial<{ id: string; email: string; status: 'activo' | 'inactivo' }> = {}): User {
  return new User({
    id: overrides.id ?? 'u-1',
    name: 'Ana Pérez',
    email: Email.create(overrides.email ?? 'admin@empresa.com'),
    role: 'admin',
    status: overrides.status ?? 'activo',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
    createdAt: new Date('2026-11-04T12:34:56.789Z'),
  });
}

describe('DrizzleUserRepository', () => {
  let t: TestDb;

  beforeEach(() => {
    t = createTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    t.cleanup();
  });

  // DrizzleUserRepository inserta y encuentra por email normalizado
  it('test_drizzle_user_repository_inserta_y_encuentra_por_email_normalizado', () => {
    const repo = new DrizzleUserRepository(t.db);
    expect(repo.countAll()).toBe(0);

    repo.insert(makeUser({ email: 'admin@empresa.com' }));

    expect(repo.countAll()).toBe(1);
    const found = repo.findByEmail(Email.create('  Admin@Empresa.com '));
    expect(found).not.toBeNull();
    expect(found).toBeInstanceOf(User);
    expect(found?.id).toBe('u-1');
    expect(found?.name).toBe('Ana Pérez');
    expect(found?.email.value).toBe('admin@empresa.com');
    expect(found?.role).toBe('admin');
    expect(found?.status).toBe('activo');
    expect(found?.passwordHash).toBe('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA');
    expect(found?.createdAt).toBeInstanceOf(Date);
    expect(found?.createdAt.toISOString()).toBe('2026-11-04T12:34:56.789Z');

    // la fecha se persiste como ISO 8601
    const row = t.db.$client.prepare('SELECT email, created_at FROM users WHERE id = ?').get('u-1') as {
      email: string;
      created_at: string;
    };
    expect(row).toEqual({ email: 'admin@empresa.com', created_at: '2026-11-04T12:34:56.789Z' });

    expect(repo.findById('u-1')?.email.value).toBe('admin@empresa.com');
    expect(repo.findById('no-existe')).toBeNull();
    expect(repo.findByEmail(Email.create('otro@empresa.com'))).toBeNull();
  });

  // DrizzleUserRepository con email duplicado es rechazado como FirstAdminAlreadyExists
  it('test_drizzle_user_repository_email_duplicado_rechazado_first_admin_already_exists', () => {
    const repo = new DrizzleUserRepository(t.db);
    repo.insert(makeUser({ id: 'u-1', email: 'admin@empresa.com' }));

    expect(() => { repo.insert(makeUser({ id: 'u-2', email: 'admin@empresa.com' })); }).toThrow(FirstAdminAlreadyExists);

    expect(repo.countAll()).toBe(1);
    expect(repo.findById('u-2')).toBeNull();
  });

  it('findById y findByEmail lanzan si created_at no es un ISO 8601 válido (no hidrata Invalid Date)', () => {
    const repo = new DrizzleUserRepository(t.db);
    repo.insert(makeUser());
    t.db.$client.prepare("UPDATE users SET created_at = '2026-13-45T99:00:00Z' WHERE id = 'u-1'").run();

    expect(() => repo.findById('u-1')).toThrow(/users\.created_at.*2026-13-45T99:00:00Z/);
    expect(() => repo.findByEmail(Email.create('admin@empresa.com'))).toThrow(/users\.created_at/);
  });

  it('un UNIQUE de otra columna users.email_* no se traduce a FirstAdminAlreadyExists', () => {
    const repo = new DrizzleUserRepository(t.db);
    const sqliteError = Object.assign(new Error('UNIQUE constraint failed: users.email_verified_token'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    });
    // como lo entrega Drizzle: el SqliteError viaja en `cause`
    const wrapped = new Error('Failed query: insert into "users" ...', { cause: sqliteError });
    vi.spyOn(t.db, 'insert').mockImplementation(() => {
      throw wrapped;
    });

    let caught: unknown;
    try {
      repo.insert(makeUser());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(wrapped);
    expect(caught).not.toBeInstanceOf(FirstAdminAlreadyExists);
  });

  it('el UNIQUE exacto de users.email sí se traduce a FirstAdminAlreadyExists (también simulado)', () => {
    const repo = new DrizzleUserRepository(t.db);
    const sqliteError = Object.assign(new Error('UNIQUE constraint failed: users.email'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    });
    vi.spyOn(t.db, 'insert').mockImplementation(() => {
      throw new Error('Failed query', { cause: sqliteError });
    });

    expect(() => { repo.insert(makeUser()); }).toThrow(FirstAdminAlreadyExists);
  });

  it('un id duplicado no se confunde con un email duplicado y se propaga tal cual', () => {
    const repo = new DrizzleUserRepository(t.db);
    repo.insert(makeUser({ id: 'u-1', email: 'admin@empresa.com' }));

    let caught: unknown;
    try {
      repo.insert(makeUser({ id: 'u-1', email: 'otro@empresa.com' }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(FirstAdminAlreadyExists);
    expect(repo.countAll()).toBe(1);
  });
});
