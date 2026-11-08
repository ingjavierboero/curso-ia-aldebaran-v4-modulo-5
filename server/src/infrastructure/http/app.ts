import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { AuthenticateSession } from '../../application/auth/AuthenticateSession.js';
import type { GetSetupStatus } from '../../application/auth/GetSetupStatus.js';
import type { Login } from '../../application/auth/Login.js';
import type { Logout } from '../../application/auth/Logout.js';
import type { RegisterFirstAdmin } from '../../application/auth/RegisterFirstAdmin.js';
import type { Clock } from '../../domain/shared/Clock.js';
import { createAuthMiddleware } from './authMiddleware.js';
import type { Logger } from './authLog.js';
import { createErrorHandler } from './errorHandler.js';
import { requireJson } from './requireJson.js';
import { authRoutes } from './routes/auth.js';
import { setupRoutes } from './routes/setup.js';
import { defaultSecureCookie } from './sessionCookie.js';

/** Dependencias de la app: casos de uso, reloj y logger. Las arma el composition root (`main.ts`). */
export interface AppDeps {
  login: Pick<Login, 'execute'>;
  logout: Pick<Logout, 'execute'>;
  authenticateSession: Pick<AuthenticateSession, 'execute'>;
  registerFirstAdmin: Pick<RegisterFirstAdmin, 'execute'>;
  getSetupStatus: Pick<GetSetupStatus, 'execute'>;
  clock: Clock;
  logger: Logger;
  /** `Secure` en la cookie de sesión. Por defecto, `NODE_ENV=production`. */
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
  // FR-01: deny-by-default sobre todo /api salvo las tres rutas públicas.
  app.use('/api', createAuthMiddleware(deps));
  app.use('/api', authRoutes({ ...deps, secureCookie }), setupRoutes(deps));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'No encontrado' });
  });
  app.use(createErrorHandler({ logger: deps.logger, clock: deps.clock, secureCookie }));

  return app;
}
