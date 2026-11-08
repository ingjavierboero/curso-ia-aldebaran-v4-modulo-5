import { Router, type Request, type Response } from 'express';
import { InvalidCredentials } from '../../../application/auth/errors.js';
import type { Login } from '../../../application/auth/Login.js';
import type { Logout } from '../../../application/auth/Logout.js';
import type { Clock } from '../../../domain/shared/Clock.js';
import { Email } from '../../../domain/user/Email.js';
import { InvalidEmail } from '../../../domain/user/errors.js';
import { PasswordPolicy } from '../../../domain/user/PasswordPolicy.js';
import { type Logger, logAuthAttempt } from '../authLog.js';
import { bodyObject, requiredString } from '../body.js';
import { clearSessionCookie, setSessionCookie } from '../sessionCookie.js';

export interface AuthRoutesDeps {
  login: Pick<Login, 'execute'>;
  logout: Pick<Logout, 'execute'>;
  clock: Clock;
  logger: Logger;
  secureCookie: boolean;
}

/** `/auth/login` (pública), `/auth/logout` y `/auth/session` (con sesión, vía `authMiddleware`). */
export function authRoutes(deps: AuthRoutesDeps): Router {
  const router = Router();

  router.post('/auth/login', async (req: Request, res: Response) => {
    const body = bodyObject(req.body);
    const email = requiredString(body, 'email', Email.MAX_LENGTH);
    // Tope de 1024 acá y no en `Login`: aplicar `PasswordPolicy` en el caso de uso daría 400 a una
    // contraseña corta en lugar del 401 genérico (decisión de Block 2; R-03).
    const password = requiredString(body, 'password', PasswordPolicy.MAX_LENGTH);

    let result;
    try {
      result = await deps.login.execute({ email, password });
    } catch (err) {
      const outcome = err instanceof InvalidCredentials || err instanceof InvalidEmail ? 'invalid' : 'error';
      logAuthAttempt(deps.logger, deps.clock, req, 'login', outcome, email);
      throw err;
    }
    logAuthAttempt(deps.logger, deps.clock, req, 'login', 'ok', email);

    setSessionCookie(res, result.token, deps.secureCookie);
    res.status(200).json({ user: result.user });
  });

  router.post('/auth/logout', (req: Request, res: Response) => {
    if (req.sessionToken !== undefined) deps.logout.execute(req.sessionToken);
    clearSessionCookie(res, deps.secureCookie);
    res.status(204).end();
  });

  router.get('/auth/session', (req: Request, res: Response) => {
    res.status(200).json({ user: req.user });
  });

  return router;
}
