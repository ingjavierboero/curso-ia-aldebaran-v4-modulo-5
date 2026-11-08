import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthenticateSession } from '../../application/auth/AuthenticateSession.js';
import type { PublicUser } from '../../application/auth/dto/PublicUser.js';
import { Unauthenticated } from '../../application/auth/errors.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { Logger } from './authLog.js';
import { readSessionToken } from './sessionCookie.js';

declare global {
  namespace Express {
    interface Request {
      /** Usuario de la sesión validada por `authMiddleware`. */
      user?: PublicUser;
      /** Token de la cookie de sesión ya validado (para el logout). Nunca se loguea. */
      sessionToken?: string;
    }
  }
}

/**
 * Únicas rutas que cruzan sin sesión (FR-01). Comparación exacta de método y ruta completa:
 * cualquier variante (otro método, sufijo, mayúsculas) cae del lado de "exige sesión".
 */
const PUBLIC_ROUTES = new Set(['POST /api/auth/login', 'GET /api/setup/status', 'POST /api/setup/first-admin']);

export interface AuthMiddlewareDeps {
  authenticateSession: Pick<AuthenticateSession, 'execute'>;
  logger: Logger;
  clock: Clock;
}

/**
 * Deny-by-default sobre `/api` (montado ahí): salvo las rutas públicas, toda solicitud exige una
 * cookie `aldebaran_sid` válida. Si no, `Unauthenticated` → 401 y cookie borrada (`errorHandler`).
 */
export function createAuthMiddleware(deps: AuthMiddlewareDeps): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (PUBLIC_ROUTES.has(`${req.method} ${req.baseUrl}${req.path}`)) {
      next();
      return;
    }

    const token = readSessionToken(req);
    try {
      if (token === null) throw new Unauthenticated();
      req.user = deps.authenticateSession.execute(token);
      req.sessionToken = token;
    } catch (err) {
      if (err instanceof Unauthenticated) {
        deps.logger.info({
          event: 'session_rejected',
          ip: req.ip ?? null,
          path: `${req.baseUrl}${req.path}`,
          at: deps.clock.now().toISOString(),
        });
      }
      throw err;
    }
    next();
  };
}
