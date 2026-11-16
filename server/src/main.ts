// Composition root: el único lugar que arma las implementaciones concretas.
import { randomUUID } from 'node:crypto';
import { constants as osConstants } from 'node:os';
import { AuthenticateSession } from './application/auth/AuthenticateSession.js';
import { ChangeOwnPassword } from './application/auth/ChangeOwnPassword.js';
import { CheckPasswordResetToken } from './application/auth/CheckPasswordResetToken.js';
import { GetSetupStatus } from './application/auth/GetSetupStatus.js';
import { Login } from './application/auth/Login.js';
import { Logout } from './application/auth/Logout.js';
import { PeekSession } from './application/auth/PeekSession.js';
import { RegisterFirstAdmin } from './application/auth/RegisterFirstAdmin.js';
import { RequestPasswordReset } from './application/auth/RequestPasswordReset.js';
import { ResetPasswordWithToken } from './application/auth/ResetPasswordWithToken.js';
import { AssignProducts } from './application/client/AssignProducts.js';
import { CreateClient } from './application/client/CreateClient.js';
import { DeactivateClient } from './application/client/DeactivateClient.js';
import { GetClient } from './application/client/GetClient.js';
import { ListClients } from './application/client/ListClients.js';
import { ReactivateClient } from './application/client/ReactivateClient.js';
import { UnassignProduct } from './application/client/UnassignProduct.js';
import { UpdateClient } from './application/client/UpdateClient.js';
import { GetHealth } from './application/health/GetHealth.js';
import { JobRegistry } from './application/health/JobRegistry.js';
import { CreateProduct } from './application/product/CreateProduct.js';
import { DeactivateProduct } from './application/product/DeactivateProduct.js';
import { ListProducts } from './application/product/ListProducts.js';
import { ReactivateProduct } from './application/product/ReactivateProduct.js';
import { UpdateProduct } from './application/product/UpdateProduct.js';
import { CreateUser } from './application/user/CreateUser.js';
import { DeactivateUser } from './application/user/DeactivateUser.js';
import { ListUsers } from './application/user/ListUsers.js';
import { ReactivateUser } from './application/user/ReactivateUser.js';
import { UpdateUser } from './application/user/UpdateUser.js';
import { Argon2PasswordHasher } from './infrastructure/auth/Argon2PasswordHasher.js';
import { CryptoSessionTokenGenerator } from './infrastructure/auth/CryptoSessionTokenGenerator.js';
import { UuidGenerator } from './infrastructure/auth/UuidGenerator.js';
import { SystemClock } from './infrastructure/clock/SystemClock.js';
import { createDb, resolveDatabasePath } from './infrastructure/db/client.js';
import { DrizzleClientProductRepository } from './infrastructure/db/DrizzleClientProductRepository.js';
import { DrizzleClientRepository } from './infrastructure/db/DrizzleClientRepository.js';
import { DrizzleProductRepository } from './infrastructure/db/DrizzleProductRepository.js';
import { DrizzleJobRunRepository } from './infrastructure/db/DrizzleJobRunRepository.js';
import { DrizzlePasswordResetTokenRepository } from './infrastructure/db/DrizzlePasswordResetTokenRepository.js';
import { DrizzleSessionRepository } from './infrastructure/db/DrizzleSessionRepository.js';
import { DrizzleUnitOfWork } from './infrastructure/db/DrizzleUnitOfWork.js';
import { DrizzleUserRepository } from './infrastructure/db/DrizzleUserRepository.js';
import { migrate } from './infrastructure/db/migrate.js';
import { SqliteDatabaseProbe } from './infrastructure/db/SqliteDatabaseProbe.js';
import { createEmailSender } from './infrastructure/email/createEmailSender.js';
import { resolveAppUrlWithNotice } from './infrastructure/email/emailConfig.js';
import { createApp } from './infrastructure/http/app.js';
import { createJsonLogger } from './infrastructure/http/authLog.js';
import { parsePort } from './infrastructure/http/parsePort.js';
import { createHealthEventLog } from './infrastructure/logging/healthEventLog.js';
import { createPasswordResetLog } from './infrastructure/logging/passwordResetLog.js';

async function main(): Promise<void> {
  // Antes de crear cualquier Date (los imports de arriba no leen la zona horaria al evaluarse).
  process.env.TZ = 'America/Argentina/Buenos_Aires';
  const logger = createJsonLogger();
  // Antes de abrir la base: un PORT inválido corta el arranque por `startup_failed` (código 1).
  const port = parsePort(process.env.PORT);
  const clock = new SystemClock();
  // FEAT-008 (ADR-007): igual que PORT, una APP_URL o un EMAIL_REDIRECT_TO inválidos lanzan
  // `InvalidConfig` y cortan el arranque por `startup_failed` antes de abrir la base. Acá también se
  // registran `app_url_default`, `email_unconfigured` y `email_redirect_active`.
  const appUrl = resolveAppUrlWithNotice({ logger, clock });
  const emailSender = createEmailSender({ logger, clock });

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
  // R-02: hash de una contraseña aleatoria, contra el que se verifica cuando el email no existe.
  const dummyHash = await hasher.hash(randomUUID());

  // FEAT-003: hoy no hay procesos registrados; los que vengan se registran acá.
  const jobRegistry = new JobRegistry();
  const jobRuns = new DrizzleJobRunRepository(db);
  // ADR-005: conexión dedicada de solo lectura para el sondeo; se cierra al terminar el proceso.
  const probe = new SqliteDatabaseProbe(databasePath);
  closeOnExit(probe);
  // Después de fijar TZ: el arranque desde el que se mide el atraso de un proceso sin corridas.
  const systemStartedAt = clock.now();

  // FEAT-008: recuperación de contraseña. Instancia propia del generador para los tokens de
  // recuperación (reuso deliberado de `SessionTokenGenerator`, spec FEAT-008).
  const resetTokens = new DrizzlePasswordResetTokenRepository(db);
  const resetTokenGenerator = new CryptoSessionTokenGenerator();
  const requestPasswordReset = new RequestPasswordReset({
    users,
    resetTokens,
    uow,
    resetTokenGenerator,
    ids,
    clock,
    emailSender,
    resetLog: createPasswordResetLog(logger, clock),
    appUrl,
  });
  const checkPasswordResetToken = new CheckPasswordResetToken({ users, resetTokens, resetTokenGenerator, clock });
  const resetPasswordWithToken = new ResetPasswordWithToken({
    users,
    resetTokens,
    uow,
    hasher,
    resetTokenGenerator,
    clock,
  });

  // FEAT-010: lecturas de clientes y productos fuera de la Unit of Work; las escrituras van por `uow`.
  const clients = new DrizzleClientRepository(db);
  const products = new DrizzleProductRepository(db);
  const clientProducts = new DrizzleClientProductRepository(db);

  const app = createApp({
    requestPasswordReset,
    checkPasswordResetToken,
    resetPasswordWithToken,
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
      systemStartedAt,
      log: createHealthEventLog(logger, clock),
    }),
    peekSession: new PeekSession({ users, sessions, tokens, clock }),
    listUsers: new ListUsers({ users }),
    createUser: new CreateUser({ uow, hasher, ids, clock }),
    updateUser: new UpdateUser({ uow }),
    deactivateUser: new DeactivateUser({ uow }),
    reactivateUser: new ReactivateUser({ uow }),
    listClients: new ListClients({ clients }),
    getClient: new GetClient({ clients, products, clientProducts }),
    createClient: new CreateClient({ uow, ids, clock }),
    updateClient: new UpdateClient({ uow }),
    deactivateClient: new DeactivateClient({ uow }),
    reactivateClient: new ReactivateClient({ uow }),
    assignProducts: new AssignProducts({ uow, clock }),
    unassignProduct: new UnassignProduct({ uow }),
    listProducts: new ListProducts({ products }),
    createProduct: new CreateProduct({ uow, ids, clock }),
    updateProduct: new UpdateProduct({ uow }),
    deactivateProduct: new DeactivateProduct({ uow }),
    reactivateProduct: new ReactivateProduct({ uow }),
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

/**
 * Cierra el sondeo al salir. SIGINT/SIGTERM terminan el proceso con el código convencional
 * (128 + número de señal), que es lo que hacían antes de tener handler; `exit` cierra la conexión.
 */
function closeOnExit(probe: SqliteDatabaseProbe): void {
  process.once('exit', () => {
    try {
      probe.close();
    } catch {
      // saliendo: no hay nada más que hacer con una conexión que no cierra
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => process.exit(128 + osConstants.signals[signal]));
  }
}

main().catch((err: unknown) => {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${JSON.stringify({ level: 'error', event: 'startup_failed', error: detail })}\n`);
  process.exit(1);
});
