import { verify as argon2Verify } from '@node-rs/argon2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Email } from '../../src/domain/user/Email.js';
import { User } from '../../src/domain/user/User.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/auth/Argon2PasswordHasher.js';
import { DrizzleUserRepository } from '../../src/infrastructure/db/DrizzleUserRepository.js';
import { createTestDb, type TestDb } from '../support/sqliteTestDb.js';

// Pasa por la implementación real salvo que un test la reemplace con `mockRejectedValueOnce`.
vi.mock('@node-rs/argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@node-rs/argon2')>();
  return { ...actual, verify: vi.fn(actual.verify) };
});

const PLAIN = 'contraseña-muy-segura';

function nativeError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('Argon2PasswordHasher', () => {
  let t: TestDb;

  beforeEach(() => {
    t = createTestDb();
  });

  afterEach(() => {
    t.cleanup();
  });

  // Argon2PasswordHasher con parámetros de producción guarda un hash $argon2id$ sin la contraseña en texto plano
  it('test_argon2_parametros_de_produccion_guarda_hash_argon2id_sin_contrasena', async () => {
    const hasher = new Argon2PasswordHasher();

    const passwordHash = await hasher.hash(PLAIN);
    new DrizzleUserRepository(t.db).insert(
      new User({
        id: 'u-1',
        name: 'Ana',
        email: Email.create('admin@empresa.com'),
        role: 'admin',
        status: 'activo',
        passwordHash,
        createdAt: new Date('2026-11-04T12:00:00.000Z'),
      }),
    );

    const row = t.db.$client.prepare('SELECT password_hash FROM users WHERE id = ?').get('u-1') as {
      password_hash: string;
    };
    expect(row.password_hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(row.password_hash).not.toContain(PLAIN);
    expect(await hasher.verify(row.password_hash, PLAIN)).toBe(true);
    expect(await hasher.verify(row.password_hash, 'otra-contraseña')).toBe(false);
  });

  // Argon2PasswordHasher.verify con hash inválido devuelve false (error controlado)
  it('test_argon2_verify_con_hash_invalido_devuelve_false', async () => {
    const hasher = new Argon2PasswordHasher();

    await expect(hasher.verify('no-es-un-hash-phc', PLAIN)).resolves.toBe(false);
    await expect(hasher.verify('', PLAIN)).resolves.toBe(false);
    await expect(hasher.verify('$argon2id$v=19$m=19456,t=2,p=1$roto', PLAIN)).resolves.toBe(false);
    // PHC bien formado pero con parámetros que argon2 rechaza ("Salt is too short", "Memory cost is too small")
    await expect(hasher.verify('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA', PLAIN)).resolves.toBe(false);
    await expect(hasher.verify('$argon2id$v=19$m=1,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA', PLAIN)).resolves.toBe(
      false,
    );
  });

  it('verify relanza los errores de argon2 que no son de formato del hash', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA';

    const oom = nativeError('Memory allocation error', 'GenericFailure');
    vi.mocked(argon2Verify).mockRejectedValueOnce(oom);
    await expect(hasher.verify(hash, PLAIN)).rejects.toBe(oom);

    // mismo código que un hash mal formado, pero no es un error de formato
    const threading = nativeError('Threading failure', 'InvalidArg');
    vi.mocked(argon2Verify).mockRejectedValueOnce(threading);
    await expect(hasher.verify(hash, PLAIN)).rejects.toBe(threading);

    // mismo mensaje, otro código: no es el error controlado de @node-rs/argon2
    const generic = new Error('Decoding failed');
    vi.mocked(argon2Verify).mockRejectedValueOnce(generic);
    await expect(hasher.verify(hash, PLAIN)).rejects.toBe(generic);

    const notAnError = 'boom';
    vi.mocked(argon2Verify).mockRejectedValueOnce(notAnError);
    await expect(hasher.verify(hash, PLAIN)).rejects.toBe(notAnError);
  });

  it('acepta parámetros por constructor (para tests rápidos)', async () => {
    const hasher = new Argon2PasswordHasher({ memoryCost: 1024, timeCost: 1, parallelism: 1 });

    const hash = await hasher.hash(PLAIN);

    expect(hash.startsWith('$argon2id$v=19$m=1024,t=1,p=1$')).toBe(true);
    expect(await hasher.verify(hash, PLAIN)).toBe(true);
  });
});
