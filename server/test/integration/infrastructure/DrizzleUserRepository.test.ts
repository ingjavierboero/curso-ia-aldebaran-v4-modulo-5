import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Email } from '../../../src/domain/shared/Email.js';
import { EmailAlreadyInUse } from '../../../src/domain/user/errors.js';
import { User, type UserRole } from '../../../src/domain/user/User.js';
import { DrizzleUserRepository } from '../../../src/infrastructure/db/DrizzleUserRepository.js';
import { createTestDb, type TestDb } from '../../support/sqliteTestDb.js';

function makeUser(
  overrides: Partial<{ id: string; name: string; email: string; role: UserRole; status: 'activo' | 'inactivo' }> = {},
): User {
  return new User({
    id: overrides.id ?? 'u-1',
    name: overrides.name ?? 'Ana Pérez',
    email: Email.create(overrides.email ?? 'admin@empresa.com'),
    role: overrides.role ?? 'admin',
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

  // DrizzleUserRepository con email duplicado es rechazado (FEAT-001). Desde FEAT-006 el repositorio
  // lanza EmailAlreadyInUse; RegisterFirstAdmin lo traduce a FirstAdminAlreadyExists.
  it('test_drizzle_user_repository_email_duplicado_rechazado_first_admin_already_exists', () => {
    const repo = new DrizzleUserRepository(t.db);
    repo.insert(makeUser({ id: 'u-1', email: 'admin@empresa.com' }));

    expect(() => { repo.insert(makeUser({ id: 'u-2', email: 'admin@empresa.com' })); }).toThrow(EmailAlreadyInUse);

    expect(repo.countAll()).toBe(1);
    expect(repo.findById('u-2')).toBeNull();
  });

  // FEAT-006: el UNIQUE de users.email se traduce a EmailAlreadyInUse en insert y en update (SQLite real)
  it('test_user_repository_email_duplicado_lanza_email_already_in_use', () => {
    const repo = new DrizzleUserRepository(t.db);
    repo.insert(makeUser({ id: 'u-1', email: 'ana@empresa.com' }));
    repo.insert(makeUser({ id: 'u-2', email: 'eva@empresa.com' }));

    expect(() => {
      repo.insert(makeUser({ id: 'u-3', email: 'ana@empresa.com' }));
    }).toThrow(EmailAlreadyInUse);
    expect(repo.findById('u-3')).toBeNull();

    const eva = repo.findById('u-2');
    expect(eva).not.toBeNull();
    expect(() => {
      repo.update((eva as User).withProfile({ name: 'Eva', email: Email.create('ana@empresa.com'), role: 'editor' }));
    }).toThrow(EmailAlreadyInUse);
    expect(repo.findById('u-2')?.email.value).toBe('eva@empresa.com');
    expect(repo.findById('u-2')?.role).toBe('admin');
    expect(repo.countAll()).toBe(2);
  });

  it('update cambia nombre, email, perfil y estado sin tocar password_hash ni created_at', () => {
    const repo = new DrizzleUserRepository(t.db);
    repo.insert(makeUser({ id: 'u-1', email: 'ana@empresa.com' }));
    const original = repo.findById('u-1') as User;
    // una entidad con hash y fecha distintos: update no debe escribirlos
    const tampered = new User({
      id: 'u-1',
      name: 'Ana Gómez',
      email: Email.create('ana.gomez@empresa.com'),
      role: 'consulta',
      status: 'inactivo',
      passwordHash: 'otro-hash',
      createdAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    repo.update(tampered);

    const row = t.db.$client
      .prepare('SELECT name, email, role, status, password_hash, created_at FROM users WHERE id = ?')
      .get('u-1');
    expect(row).toEqual({
      name: 'Ana Gómez',
      email: 'ana.gomez@empresa.com',
      role: 'consulta',
      status: 'inactivo',
      password_hash: original.passwordHash,
      created_at: '2026-11-04T12:34:56.789Z',
    });
  });

  // FEAT-007 (AC-03): updatePasswordHash escribe solo password_hash del usuario con ese id
  it('test_drizzle_update_password_hash_solo_cambia_el_hash', () => {
    const repo = new DrizzleUserRepository(t.db);
    const original = makeUser({ id: 'u-1', email: 'admin@empresa.com', role: 'editor' });
    repo.insert(original);
    repo.insert(makeUser({ id: 'u-2', email: 'otro@empresa.com', name: 'Bruno' }));

    // nombre, email, perfil y estado distintos en la entidad: no deben persistirse
    const changed = new User({
      id: 'u-1',
      name: 'Otro Nombre',
      email: Email.create('cambiado@empresa.com'),
      role: 'admin',
      status: 'inactivo',
      passwordHash: '$argon2id$nuevo',
      createdAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    repo.updatePasswordHash(changed);

    const stored = repo.findById('u-1');
    expect(stored?.passwordHash).toBe('$argon2id$nuevo');
    expect(stored?.name).toBe('Ana Pérez');
    expect(stored?.email.value).toBe('admin@empresa.com');
    expect(stored?.role).toBe('editor');
    expect(stored?.status).toBe('activo');
    expect(stored?.createdAt.toISOString()).toBe('2026-11-04T12:34:56.789Z');
    // el otro usuario no cambia
    expect(repo.findById('u-2')?.passwordHash).toBe('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA');
    // un id inexistente no lanza ni crea nada
    expect(() => { repo.updatePasswordHash(makeUser({ id: 'no-existe', email: 'x@empresa.com' })); }).not.toThrow();
    expect(repo.countAll()).toBe(2);
  });

  it('listAll devuelve Activos e Inactivos ordenados por nombre', () => {
    const repo = new DrizzleUserRepository(t.db);
    repo.insert(makeUser({ id: 'u-1', name: 'Carla', email: 'carla@empresa.com' }));
    repo.insert(makeUser({ id: 'u-2', name: 'Ana', email: 'ana@empresa.com', status: 'inactivo' }));
    repo.insert(makeUser({ id: 'u-3', name: 'Beto', email: 'beto@empresa.com', role: 'editor' }));

    const all = repo.listAll();

    expect(all.map((u) => u.name)).toEqual(['Ana', 'Beto', 'Carla']);
    expect(all.every((u) => u instanceof User)).toBe(true);
    expect(all.map((u) => u.status)).toEqual(['inactivo', 'activo', 'activo']);
  });

  it('countActiveAdmins cuenta solo los de perfil admin y estado activo', () => {
    const repo = new DrizzleUserRepository(t.db);
    expect(repo.countActiveAdmins()).toBe(0);
    repo.insert(makeUser({ id: 'u-1', email: 'a1@empresa.com', role: 'admin', status: 'activo' }));
    repo.insert(makeUser({ id: 'u-2', email: 'a2@empresa.com', role: 'admin', status: 'activo' }));
    repo.insert(makeUser({ id: 'u-3', email: 'a3@empresa.com', role: 'admin', status: 'inactivo' }));
    repo.insert(makeUser({ id: 'u-4', email: 'e1@empresa.com', role: 'editor', status: 'activo' }));
    repo.insert(makeUser({ id: 'u-5', email: 'c1@empresa.com', role: 'consulta', status: 'activo' }));

    expect(repo.countActiveAdmins()).toBe(2);
  });

  it('findById y findByEmail lanzan si created_at no es un ISO 8601 válido (no hidrata Invalid Date)', () => {
    const repo = new DrizzleUserRepository(t.db);
    repo.insert(makeUser());
    t.db.$client.prepare("UPDATE users SET created_at = '2026-13-45T99:00:00Z' WHERE id = 'u-1'").run();

    expect(() => repo.findById('u-1')).toThrow(/users\.created_at.*2026-13-45T99:00:00Z/);
    expect(() => repo.findByEmail(Email.create('admin@empresa.com'))).toThrow(/users\.created_at/);
  });

  it('un UNIQUE de otra columna users.email_* no se traduce a EmailAlreadyInUse', () => {
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
    expect(caught).not.toBeInstanceOf(EmailAlreadyInUse);
  });

  it('el UNIQUE exacto de users.email sí se traduce a EmailAlreadyInUse (también simulado)', () => {
    const repo = new DrizzleUserRepository(t.db);
    const sqliteError = Object.assign(new Error('UNIQUE constraint failed: users.email'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    });
    vi.spyOn(t.db, 'insert').mockImplementation(() => {
      throw new Error('Failed query', { cause: sqliteError });
    });

    expect(() => { repo.insert(makeUser()); }).toThrow(EmailAlreadyInUse);
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
    expect(caught).not.toBeInstanceOf(EmailAlreadyInUse);
    expect(repo.countAll()).toBe(1);
  });
});
