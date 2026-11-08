// Composition root: el único lugar que arma las implementaciones concretas.
import { randomUUID } from 'node:crypto';
import { AuthenticateSession } from './application/auth/AuthenticateSession.js';
import { GetSetupStatus } from './application/auth/GetSetupStatus.js';
import { Login } from './application/auth/Login.js';
import { Logout } from './application/auth/Logout.js';
import { RegisterFirstAdmin } from './application/auth/RegisterFirstAdmin.js';
import { Argon2PasswordHasher } from './infrastructure/auth/Argon2PasswordHasher.js';
import { CryptoSessionTokenGenerator } from './infrastructure/auth/CryptoSessionTokenGenerator.js';
import { UuidGenerator } from './infrastructure/auth/UuidGenerator.js';
import { SystemClock } from './infrastructure/clock/SystemClock.js';
import { createDb, resolveDatabasePath } from './infrastructure/db/client.js';
import { DrizzleSessionRepository } from './infrastructure/db/DrizzleSessionRepository.js';
import { DrizzleUnitOfWork } from './infrastructure/db/DrizzleUnitOfWork.js';
import { DrizzleUserRepository } from './infrastructure/db/DrizzleUserRepository.js';
import { migrate } from './infrastructure/db/migrate.js';
import { createApp } from './infrastructure/http/app.js';
import { createJsonLogger } from './infrastructure/http/authLog.js';
import { parsePort } from './infrastructure/http/parsePort.js';

async function main(): Promise<void> {
  // Antes de crear cualquier Date (los imports de arriba no leen la zona horaria al evaluarse).
  process.env.TZ = 'America/Argentina/Buenos_Aires';
  const logger = createJsonLogger();
  // Antes de abrir la base: un PORT inválido corta el arranque por `startup_failed` (código 1).
  const port = parsePort(process.env.PORT);

  const databasePath = resolveDatabasePath();
  const db = createDb(databasePath);
  migrate(db);

  const users = new DrizzleUserRepository(db);
  const sessions = new DrizzleSessionRepository(db);
  const uow = new DrizzleUnitOfWork(db);
  // Parámetros de producción (NFR-01, ADR-002): nunca se reducen acá.
  const hasher = new Argon2PasswordHasher();
  const tokens = new CryptoSessionTokenGenerator();
  const ids = new UuidGenerator();
  const clock = new SystemClock();
  // R-02: hash de una contraseña aleatoria, contra el que se verifica cuando el email no existe.
  const dummyHash = await hasher.hash(randomUUID());

  const app = createApp({
    login: new Login({ users, sessions, hasher, tokens, ids, clock, dummyHash }),
    logout: new Logout({ sessions, tokens }),
    authenticateSession: new AuthenticateSession({ users, sessions, tokens, clock }),
    registerFirstAdmin: new RegisterFirstAdmin({ uow, hasher, ids, clock }),
    getSetupStatus: new GetSetupStatus({ users }),
    clock,
    logger,
  });

  app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ event: 'server_error', error: err.message, at: clock.now().toISOString() });
      process.exit(1);
    }
    logger.info({ event: 'server_started', port, database: databasePath, at: clock.now().toISOString() });
  });
}

main().catch((err: unknown) => {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${JSON.stringify({ level: 'error', event: 'startup_failed', error: detail })}\n`);
  process.exit(1);
});
