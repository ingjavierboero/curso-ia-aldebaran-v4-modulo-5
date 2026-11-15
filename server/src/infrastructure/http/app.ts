import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { AuthenticateSession } from '../../application/auth/AuthenticateSession.js';
import type { ChangeOwnPassword } from '../../application/auth/ChangeOwnPassword.js';
import type { GetSetupStatus } from '../../application/auth/GetSetupStatus.js';
import type { Login } from '../../application/auth/Login.js';
import type { Logout } from '../../application/auth/Logout.js';
import type { PeekSession } from '../../application/auth/PeekSession.js';
import type { RegisterFirstAdmin } from '../../application/auth/RegisterFirstAdmin.js';
import type { GetHealth } from '../../application/health/GetHealth.js';
import type { CreateUser } from '../../application/user/CreateUser.js';
import type { DeactivateUser } from '../../application/user/DeactivateUser.js';
import type { ListUsers } from '../../application/user/ListUsers.js';
import type { ReactivateUser } from '../../application/user/ReactivateUser.js';
import type { UpdateUser } from '../../application/user/UpdateUser.js';
import type { Clock } from '../../domain/shared/Clock.js';
import { createAuthMiddleware } from './authMiddleware.js';
import type { Logger } from './authLog.js';
import { createErrorHandler } from './errorHandler.js';
import { AttemptTracker } from './rateLimit/AttemptTracker.js';
import { bodyEmailOf, createAttemptGate } from './rateLimit/attemptGate.js';
import { requireJson } from './requireJson.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { setupRoutes } from './routes/setup.js';
import { usersRoutes } from './routes/users.js';
import { defaultSecureCookie } from './sessionCookie.js';

/** Dependencias de la app: casos de uso, reloj y logger. Las arma el composition root (`main.ts`). */
export interface AppDeps {
  login: Pick<Login, 'execute'>;
  logout: Pick<Logout, 'execute'>;
  /** Cambio de la propia contraseña (FEAT-007): siempre sobre el usuario de la sesión. */
  changeOwnPassword: Pick<ChangeOwnPassword, 'execute'>;
  authenticateSession: Pick<AuthenticateSession, 'execute'>;
  registerFirstAdmin: Pick<RegisterFirstAdmin, 'execute'>;
  getSetupStatus: Pick<GetSetupStatus, 'execute'>;
  getHealth: Pick<GetHealth, 'execute'>;
  /** Valida la sesión del chequeo de salud sin renovarla (R-06). */
  peekSession: Pick<PeekSession, 'execute'>;
  /** Gestión de usuarios (FEAT-006): cada caso de uso autoriza al `Actor` que recibe. */
  listUsers: Pick<ListUsers, 'execute'>;
  createUser: Pick<CreateUser, 'execute'>;
  updateUser: Pick<UpdateUser, 'execute'>;
  deactivateUser: Pick<DeactivateUser, 'execute'>;
  reactivateUser: Pick<ReactivateUser, 'execute'>;
  clock: Clock;
  logger: Logger;
  /** `Secure` en la cookie de sesión. Por defecto, sí, salvo con `NODE_ENV` `development` o `test`. */
  secureCookie?: boolean;
}

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

/** Las respuestas de la API (datos de usuario, sesión) no se guardan en caches. */
function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function createApp(deps: AppDeps): Express {
  const secureCookie = deps.secureCookie ?? defaultSecureCookie();
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cookieParser());

  // R-07: el 415 va antes de parsear el body y antes de cualquier caso de uso.
  app.use('/api', noStore, requireJson, express.json({ limit: '10kb' }));
  // FR-01: deny-by-default sobre todo /api salvo las rutas públicas (`PUBLIC_ROUTES`).
  app.use('/api', createAuthMiddleware(deps));
  // FEAT-009 (ADR-006): un registro de intentos y una compuerta por operación, creados una sola vez
  // por app (nunca por pedido). Viven en memoria: una app nueva (un reinicio) arranca sin bloqueos.
  const { clock, logger } = deps;
  const loginTracker = new AttemptTracker(clock);
  const firstAdminTracker = new AttemptTracker(clock);
  const passwordChangeTracker = new AttemptTracker(clock);
  const loginGate = createAttemptGate({ operation: 'login', tracker: loginTracker, clock, logger, emailOf: bodyEmailOf });
  const firstAdminGate = createAttemptGate({
    operation: 'first_admin',
    tracker: firstAdminTracker,
    clock,
    logger,
    emailOf: bodyEmailOf,
  });
  const passwordChangeGate = createAttemptGate({
    operation: 'password_change',
    tracker: passwordChangeTracker,
    clock,
    logger,
    emailOf: (req) => req.user?.email ?? '',
  });

  app.use(
    '/api',
    authRoutes({ ...deps, secureCookie, loginGate, loginTracker, passwordChangeGate, passwordChangeTracker }),
    setupRoutes({ ...deps, firstAdminGate, firstAdminTracker }),
    healthRoutes(deps),
    usersRoutes(deps),
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'No encontrado' });
  });
  app.use(createErrorHandler({ logger: deps.logger, clock: deps.clock, secureCookie }));

  return app;
}
