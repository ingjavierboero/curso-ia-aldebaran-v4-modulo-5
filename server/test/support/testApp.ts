import type { Express } from 'express';
import { AuthenticateSession } from '../../src/application/auth/AuthenticateSession.js';
import { ChangeOwnPassword } from '../../src/application/auth/ChangeOwnPassword.js';
import { CheckPasswordResetToken } from '../../src/application/auth/CheckPasswordResetToken.js';
import { GetSetupStatus } from '../../src/application/auth/GetSetupStatus.js';
import { Login } from '../../src/application/auth/Login.js';
import { Logout } from '../../src/application/auth/Logout.js';
import { PeekSession } from '../../src/application/auth/PeekSession.js';
import { RegisterFirstAdmin } from '../../src/application/auth/RegisterFirstAdmin.js';
import { RequestPasswordReset } from '../../src/application/auth/RequestPasswordReset.js';
import { ResetPasswordWithToken } from '../../src/application/auth/ResetPasswordWithToken.js';
import type { EmailSender } from '../../src/application/shared/EmailSender.js';
import { GetHealth } from '../../src/application/health/GetHealth.js';
import { JobRegistry } from '../../src/application/health/JobRegistry.js';
import { CreateUser } from '../../src/application/user/CreateUser.js';
import { DeactivateUser } from '../../src/application/user/DeactivateUser.js';
import { ListUsers } from '../../src/application/user/ListUsers.js';
import { ReactivateUser } from '../../src/application/user/ReactivateUser.js';
import { UpdateUser } from '../../src/application/user/UpdateUser.js';
import { Email } from '../../src/domain/user/Email.js';
import { User, type UserRole, type UserStatus } from '../../src/domain/user/User.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/auth/Argon2PasswordHasher.js';
import { CryptoSessionTokenGenerator } from '../../src/infrastructure/auth/CryptoSessionTokenGenerator.js';
import { UuidGenerator } from '../../src/infrastructure/auth/UuidGenerator.js';
import type { Db } from '../../src/infrastructure/db/client.js';
import { DrizzlePasswordResetTokenRepository } from '../../src/infrastructure/db/DrizzlePasswordResetTokenRepository.js';
import { DrizzleSessionRepository } from '../../src/infrastructure/db/DrizzleSessionRepository.js';
import { DrizzleUnitOfWork } from '../../src/infrastructure/db/DrizzleUnitOfWork.js';
import { DrizzleUserRepository } from '../../src/infrastructure/db/DrizzleUserRepository.js';
import { type AppDeps, createApp } from '../../src/infrastructure/http/app.js';
import type { Logger, LogRecord } from '../../src/infrastructure/http/authLog.js';
import { createHealthEventLog } from '../../src/infrastructure/logging/healthEventLog.js';
import { createPasswordResetLog } from '../../src/infrastructure/logging/passwordResetLog.js';
import { FakeClock } from './FakeClock.js';
import { FakeDatabaseProbe } from './FakeDatabaseProbe.js';
import { FakeEmailSender } from './FakeEmailSender.js';
import { FakeResetTokenGenerator } from './FakeResetTokenGenerator.js';
import { InMemoryJobRunRepository } from './InMemoryJobRunRepository.js';
import { TEST_APP_URL } from './passwordResetContext.js';
import { createTestDb } from './sqliteTestDb.js';

export interface TestAppOptions {
  /** `appUrl` de `RequestPasswordReset` (FEAT-008, FR-03). Por defecto, `TEST_APP_URL`. */
  appUrl?: string;
}

/** argon2id de costo bajo, solo para tests (los de producción los usa `main.ts`). */
export const TEST_ARGON2_PARAMS = { memoryCost: 1024, timeCost: 1, parallelism: 1 } as const;

export interface CapturedLog {
  level: 'info' | 'error';
  record: LogRecord;
}

export interface SeedUserOptions {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface TestApp {
  app: Express;
  /** Las deps con que se armó `app`, para componer otra app sobre la misma base. */
  deps: AppDeps;
  db: Db;
  clock: FakeClock;
  /** Sondeo de la base que usa `getHealth` (por defecto, disponible). */
  probe: FakeDatabaseProbe;
  /** Corridas de procesos que lee `getHealth`. */
  jobRuns: InMemoryJobRunRepository;
  /** Procesos registrados que informa `getHealth` (por defecto, ninguno). */
  jobRegistry: JobRegistry;
  logs: CapturedLog[];
  /** El sender de la recuperación de contraseña (FEAT-008): guarda los emails enviados. */
  emailSender: FakeEmailSender;
  /** Generador determinista de los tokens de recuperación (formato real de 43 caracteres). */
  resetTokenGenerator: FakeResetTokenGenerator;
  /** El token en claro del último email de recuperación enviado (lo saca de la URL). */
  lastSentToken(): string;
  /** Un `RequestPasswordReset` sobre la misma base y el mismo log, con otro sender. */
  requestPasswordResetWith(emailSender: EmailSender): RequestPasswordReset;
  seedUser(options?: SeedUserOptions): Promise<User>;
  countUsers(): number;
  cleanup(): void;
}

/**
 * `createApp` sobre una base SQLite temporal migrada (nunca `data/`), argon2id de costo bajo,
 * `FakeClock` y un logger que captura en memoria. `overrides` reemplaza deps (p. ej. un caso de uso que falla).
 * La recuperación de contraseña usa `FakeEmailSender`, `FakeResetTokenGenerator` y el adaptador real
 * de `PasswordResetLog` sobre el logger de captura.
 */
export async function createTestApp(overrides: Partial<AppDeps> = {}, options: TestAppOptions = {}): Promise<TestApp> {
  const testDb = createTestDb();
  const { db } = testDb;
  const users = new DrizzleUserRepository(db);
  const sessions = new DrizzleSessionRepository(db);
  const uow = new DrizzleUnitOfWork(db);
  const hasher = new Argon2PasswordHasher(TEST_ARGON2_PARAMS);
  const tokens = new CryptoSessionTokenGenerator();
  const ids = new UuidGenerator();
  const clock = new FakeClock();
  const dummyHash = await hasher.hash('dummy-password-for-tests');
  const probe = new FakeDatabaseProbe();
  const jobRuns = new InMemoryJobRunRepository();
  const jobRegistry = new JobRegistry();

  const logs: CapturedLog[] = [];
  const logger: Logger = {
    info: (record) => logs.push({ level: 'info', record }),
    error: (record) => logs.push({ level: 'error', record }),
  };

  // FEAT-008: recuperación de contraseña con dobles para el envío y el token.
  const resetTokens = new DrizzlePasswordResetTokenRepository(db);
  const resetTokenGenerator = new FakeResetTokenGenerator();
  const emailSender = new FakeEmailSender();
  const resetLog = createPasswordResetLog(logger, clock);
  const appUrl = options.appUrl ?? TEST_APP_URL;
  const requestPasswordResetWith = (sender: EmailSender): RequestPasswordReset =>
    new RequestPasswordReset({
      users,
      resetTokens,
      uow,
      resetTokenGenerator,
      ids,
      clock,
      emailSender: sender,
      resetLog,
      appUrl,
    });

  const deps: AppDeps = {
    requestPasswordReset: requestPasswordResetWith(emailSender),
    checkPasswordResetToken: new CheckPasswordResetToken({ users, resetTokens, resetTokenGenerator, clock }),
    resetPasswordWithToken: new ResetPasswordWithToken({ users, resetTokens, uow, hasher, resetTokenGenerator, clock }),
    login: new Login({ users, sessions, hasher, tokens, ids, clock, dummyHash }),
    logout: new Logout({ sessions, tokens }),
    changeOwnPassword: new ChangeOwnPassword({ users, uow, hasher, tokens }),
    authenticateSession: new AuthenticateSession({ users, sessions, tokens, clock }),
    registerFirstAdmin: new RegisterFirstAdmin({ uow, hasher, ids, clock }),
    getSetupStatus: new GetSetupStatus({ users }),
    getHealth: new GetHealth({
      probe,
      runs: jobRuns,
      registry: jobRegistry,
      clock,
      systemStartedAt: clock.now(),
      // El adaptador real sobre el logger de captura: los tests afirman sobre la línea de log.
      log: createHealthEventLog(logger, clock),
    }),
    peekSession: new PeekSession({ users, sessions, tokens, clock }),
    listUsers: new ListUsers({ users }),
    createUser: new CreateUser({ uow, hasher, ids, clock }),
    updateUser: new UpdateUser({ uow }),
    deactivateUser: new DeactivateUser({ uow }),
    reactivateUser: new ReactivateUser({ uow }),
    clock,
    logger,
    ...overrides,
  };
  const app = createApp(deps);

  async function seedUser(options: SeedUserOptions = {}): Promise<User> {
    const user = new User({
      id: ids.next(),
      name: options.name ?? 'Ana Pérez',
      email: Email.create(options.email ?? 'admin@empresa.com'),
      role: options.role ?? 'admin',
      status: options.status ?? 'activo',
      passwordHash: await hasher.hash(options.password ?? 'contraseña-segura'),
      createdAt: clock.now(),
    });
    users.insert(user);
    return user;
  }

  return {
    app,
    deps,
    db,
    clock,
    probe,
    jobRuns,
    jobRegistry,
    logs,
    emailSender,
    resetTokenGenerator,
    lastSentToken: () => {
      const last = emailSender.sent.at(-1);
      if (!last) throw new Error('no se envió ningún email');
      const match = /\/recuperar\/([A-Za-z0-9_-]+)/.exec(last.text);
      if (!match?.[1]) throw new Error('el email no tiene la URL de recuperación');
      return match[1];
    },
    requestPasswordResetWith,
    seedUser,
    countUsers: () => users.countAll(),
    cleanup: () => {
      testDb.cleanup();
    },
  };
}

/** Extrae `aldebaran_sid=<valor>` de los `Set-Cookie` de una respuesta, o `undefined`. */
export function sessionCookieFrom(setCookie: string | string[] | undefined): string | undefined {
  const list = setCookie === undefined ? [] : Array.isArray(setCookie) ? setCookie : [setCookie];
  const header = list.find((c) => c.startsWith('aldebaran_sid='));
  return header?.split(';')[0];
}
