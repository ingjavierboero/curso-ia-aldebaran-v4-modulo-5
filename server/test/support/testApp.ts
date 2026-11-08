import type { Express } from 'express';
import { AuthenticateSession } from '../../src/application/auth/AuthenticateSession.js';
import { GetSetupStatus } from '../../src/application/auth/GetSetupStatus.js';
import { Login } from '../../src/application/auth/Login.js';
import { Logout } from '../../src/application/auth/Logout.js';
import { RegisterFirstAdmin } from '../../src/application/auth/RegisterFirstAdmin.js';
import { Email } from '../../src/domain/user/Email.js';
import { User, type UserRole, type UserStatus } from '../../src/domain/user/User.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/auth/Argon2PasswordHasher.js';
import { CryptoSessionTokenGenerator } from '../../src/infrastructure/auth/CryptoSessionTokenGenerator.js';
import { UuidGenerator } from '../../src/infrastructure/auth/UuidGenerator.js';
import type { Db } from '../../src/infrastructure/db/client.js';
import { DrizzleSessionRepository } from '../../src/infrastructure/db/DrizzleSessionRepository.js';
import { DrizzleUnitOfWork } from '../../src/infrastructure/db/DrizzleUnitOfWork.js';
import { DrizzleUserRepository } from '../../src/infrastructure/db/DrizzleUserRepository.js';
import { type AppDeps, createApp } from '../../src/infrastructure/http/app.js';
import type { Logger, LogRecord } from '../../src/infrastructure/http/authLog.js';
import { FakeClock } from './FakeClock.js';
import { createTestDb } from './sqliteTestDb.js';

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
  logs: CapturedLog[];
  seedUser(options?: SeedUserOptions): Promise<User>;
  countUsers(): number;
  cleanup(): void;
}

/**
 * `createApp` sobre una base SQLite temporal migrada (nunca `data/`), argon2id de costo bajo,
 * `FakeClock` y un logger que captura en memoria. `overrides` reemplaza deps (p. ej. un caso de uso que falla).
 */
export async function createTestApp(overrides: Partial<AppDeps> = {}): Promise<TestApp> {
  const { db, cleanup } = createTestDb();
  const users = new DrizzleUserRepository(db);
  const sessions = new DrizzleSessionRepository(db);
  const uow = new DrizzleUnitOfWork(db);
  const hasher = new Argon2PasswordHasher(TEST_ARGON2_PARAMS);
  const tokens = new CryptoSessionTokenGenerator();
  const ids = new UuidGenerator();
  const clock = new FakeClock();
  const dummyHash = await hasher.hash('dummy-password-for-tests');

  const logs: CapturedLog[] = [];
  const logger: Logger = {
    info: (record) => logs.push({ level: 'info', record }),
    error: (record) => logs.push({ level: 'error', record }),
  };

  const deps: AppDeps = {
    login: new Login({ users, sessions, hasher, tokens, ids, clock, dummyHash }),
    logout: new Logout({ sessions, tokens }),
    authenticateSession: new AuthenticateSession({ users, sessions, tokens, clock }),
    registerFirstAdmin: new RegisterFirstAdmin({ uow, hasher, ids, clock }),
    getSetupStatus: new GetSetupStatus({ users }),
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

  return { app, deps, db, clock, logs, seedUser, countUsers: () => users.countAll(), cleanup };
}

/** Extrae `aldebaran_sid=<valor>` de los `Set-Cookie` de una respuesta, o `undefined`. */
export function sessionCookieFrom(setCookie: string | string[] | undefined): string | undefined {
  const list = setCookie === undefined ? [] : Array.isArray(setCookie) ? setCookie : [setCookie];
  const header = list.find((c) => c.startsWith('aldebaran_sid='));
  return header?.split(';')[0];
}
