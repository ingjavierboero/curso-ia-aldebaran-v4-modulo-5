import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CheckPasswordResetToken } from '../../../src/application/auth/CheckPasswordResetToken.js';
import { InvalidResetToken } from '../../../src/application/auth/errors.js';
import { RequestPasswordReset } from '../../../src/application/auth/RequestPasswordReset.js';
import { ResetPasswordWithToken } from '../../../src/application/auth/ResetPasswordWithToken.js';
import { Session } from '../../../src/domain/auth/Session.js';
import { Email } from '../../../src/domain/shared/Email.js';
import { User } from '../../../src/domain/user/User.js';
import { CryptoSessionTokenGenerator } from '../../../src/infrastructure/auth/CryptoSessionTokenGenerator.js';
import { DrizzlePasswordResetTokenRepository } from '../../../src/infrastructure/db/DrizzlePasswordResetTokenRepository.js';
import { DrizzleSessionRepository } from '../../../src/infrastructure/db/DrizzleSessionRepository.js';
import { DrizzleUnitOfWork } from '../../../src/infrastructure/db/DrizzleUnitOfWork.js';
import { DrizzleUserRepository } from '../../../src/infrastructure/db/DrizzleUserRepository.js';
import { passwordResetTokens } from '../../../src/infrastructure/db/schema.js';
import { FakeClock } from '../../support/FakeClock.js';
import { FakeEmailSender } from '../../support/FakeEmailSender.js';
import { FakePasswordHasher } from '../../support/FakePasswordHasher.js';
import { FakeResetTokenGenerator } from '../../support/FakeResetTokenGenerator.js';
import { RecordingPasswordResetLog } from '../../support/RecordingPasswordResetLog.js';
import { SequentialIdGenerator } from '../../support/SequentialIdGenerator.js';
import { createTestDb, type TestDb } from '../../support/sqliteTestDb.js';

let t: TestDb;

beforeEach(() => {
  t = createTestDb();
});

afterEach(() => {
  t.cleanup();
});

function seedAna(users: DrizzleUserRepository, clock: FakeClock): User {
  const user = new User({
    id: 'u-ana',
    name: 'Ana Pérez',
    email: Email.create('ana@empresa.com'),
    role: 'editor',
    status: 'activo',
    passwordHash: 'hashed:clave-vieja-1',
    createdAt: clock.now(),
  });
  users.insert(user);
  return user;
}

describe('carreras de la recuperación sobre SQLite real', () => {
  // Dos pedidos concurrentes para el mismo usuario: 1 token y 1 email (conflict)
  it('test_race_dos_pedidos_simultaneos_un_token', async () => {
    const clock = new FakeClock();
    const users = new DrizzleUserRepository(t.db);
    seedAna(users, clock);
    const resetTokenGenerator = new FakeResetTokenGenerator();
    const emailSender = new FakeEmailSender();
    const resetLog = new RecordingPasswordResetLog();
    const request = new RequestPasswordReset({
      users,
      resetTokens: new DrizzlePasswordResetTokenRepository(t.db),
      uow: new DrizzleUnitOfWork(t.db),
      resetTokenGenerator,
      ids: new SequentialIdGenerator('rt'),
      clock,
      emailSender,
      resetLog,
      appUrl: 'http://localhost:5173',
    });

    // better-sqlite3 es síncrono y el caso de uso no tiene `await`: en un solo proceso la única forma
    // de intercalar es reentrante. El segundo pedido corre completo después de que el primero pasó el
    // control previo y antes de que entre a su transacción, así los dos vieron "sin token reciente".
    // Lo que rechaza al primero es el control dentro de la transacción IMMEDIATE, que es el mismo que
    // cubre el caso real de varios procesos sobre la misma base.
    let second: string | null = null;
    resetTokenGenerator.onGenerate = () => {
      resetTokenGenerator.onGenerate = null;
      second = request.execute('ana@empresa.com');
    };
    const first = request.execute('ana@empresa.com');
    await emailSender.settled();

    expect(first).toBe('throttled');
    expect(second).toBe('issued');
    // Los dos pasaron el control previo: los dos llegaron a generar un token.
    expect(resetTokenGenerator.generateCalls).toBe(2);
    expect(t.db.select().from(passwordResetTokens).all()).toHaveLength(1);
    expect(emailSender.sent).toHaveLength(1);
    expect(resetLog.deliveries).toHaveLength(1);
  });

  // Dos confirmaciones concurrentes con el mismo token: una cambia la contraseña y la otra lanza (conflict)
  it('test_race_dos_confirmaciones_una_rechazada', async () => {
    const clock = new FakeClock();
    const users = new DrizzleUserRepository(t.db);
    const sessions = new DrizzleSessionRepository(t.db);
    const resetTokens = new DrizzlePasswordResetTokenRepository(t.db);
    const uow = new DrizzleUnitOfWork(t.db);
    const user = seedAna(users, clock);
    sessions.insert(
      new Session({ id: 's-1', userId: user.id, tokenHash: 'x'.repeat(64), createdAt: clock.now(), lastActivityAt: clock.now() }),
    );
    const resetTokenGenerator = new CryptoSessionTokenGenerator();
    const emailSender = new FakeEmailSender();
    const hasher = new FakePasswordHasher();
    new RequestPasswordReset({
      users,
      resetTokens,
      uow,
      resetTokenGenerator,
      ids: new SequentialIdGenerator('rt'),
      clock,
      emailSender,
      resetLog: new RecordingPasswordResetLog(),
      appUrl: 'http://localhost:5173',
    }).execute('ana@empresa.com');
    await emailSender.settled();
    const token = /\/recuperar\/([A-Za-z0-9_-]{43})/.exec(emailSender.sent[0]?.text ?? '')?.[1] ?? '';
    expect(token).toHaveLength(43);

    const reset = new ResetPasswordWithToken({ users, resetTokens, uow, hasher, resetTokenGenerator, clock });
    const results = await Promise.allSettled([
      reset.execute({ token, newPassword: 'clave-de-ana-1' }),
      reset.execute({ token, newPassword: 'clave-de-beto-2' }),
    ]);

    // Las dos pasaron el control previo (las dos llegaron a hashear) y solo una escribió.
    expect(hasher.hashCalls).toHaveLength(2);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(InvalidResetToken);

    const winner = results[0]?.status === 'fulfilled' ? 'clave-de-ana-1' : 'clave-de-beto-2';
    expect(users.findById('u-ana')?.passwordHash).toBe(`hashed:${winner}`);
    expect(sessions.findByTokenHash('x'.repeat(64))).toBeNull();
    expect(() => {
      new CheckPasswordResetToken({ users, resetTokens, resetTokenGenerator, clock }).execute(token);
    }).toThrow(InvalidResetToken);
  });
});
