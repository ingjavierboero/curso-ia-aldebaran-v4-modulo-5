import { afterEach, describe, expect, it } from 'vitest';
import { PasswordResetToken, RESET_EMAIL_COOLDOWN_MS, RESET_TOKEN_TTL_MS } from '../../../src/domain/auth/PasswordResetToken.js';
import type { PasswordResetTokenRepository } from '../../../src/domain/auth/PasswordResetTokenRepository.js';
import { Email } from '../../../src/domain/shared/Email.js';
import { User } from '../../../src/domain/user/User.js';
import { DrizzlePasswordResetTokenRepository } from '../../../src/infrastructure/db/DrizzlePasswordResetTokenRepository.js';
import { DrizzleUserRepository } from '../../../src/infrastructure/db/DrizzleUserRepository.js';
import { InMemoryPasswordResetTokenRepository } from '../../support/InMemoryPasswordResetTokenRepository.js';
import { createTestDb, type TestDb } from '../../support/sqliteTestDb.js';

const MIN = 60_000;
const T0 = new Date('2026-11-16T12:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const hash = (c: string) => c.repeat(64);

function makeUser(id: string, email: string): User {
  return new User({ id, name: 'Ana', email: Email.create(email), role: 'admin', status: 'activo', passwordHash: 'h', createdAt: T0 });
}

function issue(id: string, userId: string, tokenHash: string, now: Date): PasswordResetToken {
  return PasswordResetToken.issue({ id, userId, tokenHash, now });
}

interface Fixture {
  repo: PasswordResetTokenRepository;
  /** Crea el usuario para que la FK de la versión Drizzle lo acepte (no hace nada en memoria). */
  seedUser: (id: string, email: string) => void;
}

const opened: TestDb[] = [];

const implementations: [string, () => Fixture][] = [
  ['InMemoryPasswordResetTokenRepository', () => ({ repo: new InMemoryPasswordResetTokenRepository(), seedUser: () => {} })],
  [
    'DrizzlePasswordResetTokenRepository',
    () => {
      const t = createTestDb();
      opened.push(t);
      const users = new DrizzleUserRepository(t.db);
      return {
        repo: new DrizzlePasswordResetTokenRepository(t.db),
        seedUser: (id, email) => {
          users.insert(makeUser(id, email));
        },
      };
    },
  ],
];

// El doble en memoria y el repositorio real cumplen el mismo contrato del puerto.
describe.each(implementations)('contrato PasswordResetTokenRepository — %s', (_name, create) => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  it('insert y findByTokenHash devuelven el token con todas sus fechas', () => {
    const { repo, seedUser } = create();
    seedUser('u-1', 'a@empresa.com');
    repo.insert(issue('t-1', 'u-1', hash('a'), T0));

    const found = repo.findByTokenHash(hash('a'));
    expect(found?.id).toBe('t-1');
    expect(found?.userId).toBe('u-1');
    expect(found?.createdAt.toISOString()).toBe(T0.toISOString());
    expect(found?.expiresAt.toISOString()).toBe(at(RESET_TOKEN_TTL_MS).toISOString());
    expect(found?.usedAt).toBeNull();
    expect(found?.invalidatedAt).toBeNull();
    expect(repo.findByTokenHash(hash('z'))).toBeNull();
  });

  /** u-1: t-old (T0), t-used (T0+20), t-open (T0+30); u-2: t-other (T0+40). */
  function seeded(): PasswordResetTokenRepository {
    const { repo, seedUser } = create();
    seedUser('u-1', 'a@empresa.com');
    seedUser('u-2', 'b@empresa.com');
    repo.insert(issue('t-old', 'u-1', hash('a'), T0));
    repo.insert(issue('t-used', 'u-1', hash('b'), at(20 * MIN)));
    repo.insert(issue('t-open', 'u-1', hash('c'), at(30 * MIN)));
    repo.insert(issue('t-other', 'u-2', hash('d'), at(40 * MIN)));
    return repo;
  }

  it('latestCreatedAtForUser devuelve la emisión más reciente de cada usuario, o null sin tokens', () => {
    const { repo, seedUser } = create();
    seedUser('u-1', 'a@empresa.com');
    expect(repo.latestCreatedAtForUser('u-1')).toBeNull();

    const full = seeded();
    expect(full.latestCreatedAtForUser('u-1')?.toISOString()).toBe(at(30 * MIN).toISOString());
    expect(full.latestCreatedAtForUser('u-2')?.toISOString()).toBe(at(40 * MIN).toISOString());
    expect(full.latestCreatedAtForUser('u-3')).toBeNull();
  });

  it('markUsed marca un token usable y un segundo markUsed devuelve false sin cambiar used_at', () => {
    const repo = seeded();

    expect(repo.markUsed('t-used', at(21 * MIN))).toBe(true);
    expect(repo.findByTokenHash(hash('b'))?.usedAt?.toISOString()).toBe(at(21 * MIN).toISOString());

    expect(repo.markUsed('t-used', at(22 * MIN))).toBe(false);
    expect(repo.findByTokenHash(hash('b'))?.usedAt?.toISOString()).toBe(at(21 * MIN).toISOString());
  });

  it('markUsed no marca un token anulado ni uno inexistente', () => {
    const repo = seeded();
    repo.invalidateAllForUser('u-1', at(31 * MIN));

    expect(repo.markUsed('t-open', at(32 * MIN))).toBe(false);
    expect(repo.findByTokenHash(hash('c'))?.usedAt).toBeNull();
    expect(repo.markUsed('no-existe', at(32 * MIN))).toBe(false);
  });

  it('invalidateAllForUser no toca los usados ni los de otro usuario, ni re-anula los anulados', () => {
    const repo = seeded();
    repo.markUsed('t-used', at(21 * MIN));

    repo.invalidateAllForUser('u-1', at(31 * MIN));
    expect(repo.findByTokenHash(hash('a'))?.invalidatedAt?.toISOString()).toBe(at(31 * MIN).toISOString());
    expect(repo.findByTokenHash(hash('c'))?.invalidatedAt?.toISOString()).toBe(at(31 * MIN).toISOString());
    expect(repo.findByTokenHash(hash('b'))?.invalidatedAt).toBeNull();
    expect(repo.findByTokenHash(hash('b'))?.usedAt?.toISOString()).toBe(at(21 * MIN).toISOString());
    expect(repo.findByTokenHash(hash('d'))?.invalidatedAt).toBeNull();

    repo.invalidateAllForUser('u-1', at(32 * MIN));
    expect(repo.findByTokenHash(hash('a'))?.invalidatedAt?.toISOString()).toBe(at(31 * MIN).toISOString());
  });

  it('test_reset_token_repo_contrato_invalida_y_purga', () => {
    const repo = seeded();
    repo.markUsed('t-used', at(21 * MIN));
    repo.invalidateAllForUser('u-1', at(31 * MIN));

    // deleteExpiredForUser: borra solo los vencidos hace más de RESET_EMAIL_COOLDOWN_MS
    // t-old vence a T0+10; t-used a T0+30; t-open a T0+40.
    const limitForOld = RESET_TOKEN_TTL_MS + RESET_EMAIL_COOLDOWN_MS; // T0+15
    repo.deleteExpiredForUser('u-1', at(limitForOld));
    expect(repo.findByTokenHash(hash('a'))?.id).toBe('t-old');
    repo.deleteExpiredForUser('u-1', at(limitForOld + 1));
    expect(repo.findByTokenHash(hash('a'))).toBeNull();
    expect(repo.findByTokenHash(hash('b'))?.id).toBe('t-used');
    expect(repo.findByTokenHash(hash('c'))?.id).toBe('t-open');

    // El usado (vencido a T0+30) se purga; el vencido reciente sigue contando para el enfriamiento.
    repo.deleteExpiredForUser('u-1', at(41 * MIN));
    expect(repo.findByTokenHash(hash('b'))).toBeNull();
    expect(repo.findByTokenHash(hash('c'))?.id).toBe('t-open');
    expect(repo.latestCreatedAtForUser('u-1')?.toISOString()).toBe(at(30 * MIN).toISOString());

    // No toca los de otro usuario aunque estén vencidos hace mucho.
    repo.deleteExpiredForUser('u-1', at(500 * MIN));
    expect(repo.latestCreatedAtForUser('u-1')).toBeNull();
    expect(repo.findByTokenHash(hash('d'))?.id).toBe('t-other');
  });

  it('test_reset_token_hash_duplicado_rechazado', () => {
    const { repo, seedUser } = create();
    seedUser('u-1', 'a@empresa.com');
    repo.insert(issue('t-1', 'u-1', hash('a'), T0));

    expect(() => {
      repo.insert(issue('t-2', 'u-1', hash('a'), at(MIN)));
    }).toThrow(/UNIQUE/);
    expect(repo.findByTokenHash(hash('a'))?.id).toBe('t-1');
    expect(repo.latestCreatedAtForUser('u-1')?.toISOString()).toBe(T0.toISOString());
  });
});

describe('DrizzlePasswordResetTokenRepository', () => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  it('test_reset_token_usuario_inexistente_rechazado', () => {
    const t = createTestDb();
    opened.push(t);
    const repo = new DrizzlePasswordResetTokenRepository(t.db);

    expect(() => {
      repo.insert(issue('t-1', 'no-existe', hash('a'), T0));
    }).toThrow(/FOREIGN KEY/);
    expect(t.db.$client.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').get()).toEqual({ n: 0 });
  });
});
