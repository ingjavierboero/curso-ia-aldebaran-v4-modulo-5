import { Router, type Request, type Response } from 'express';
import type { ChangeOwnPassword } from '../../../application/auth/ChangeOwnPassword.js';
import { IncorrectCurrentPassword, InvalidCredentials } from '../../../application/auth/errors.js';
import type { Login } from '../../../application/auth/Login.js';
import type { Logout } from '../../../application/auth/Logout.js';
import type { Clock } from '../../../domain/shared/Clock.js';
import { Email } from '../../../domain/user/Email.js';
import { InvalidEmail, PasswordUnchanged, WeakPassword } from '../../../domain/user/errors.js';
import { PasswordPolicy } from '../../../domain/user/PasswordPolicy.js';
import { type AuthOutcome, type Logger, logAuthAttempt } from '../authLog.js';
import { bodyObject, InvalidBody, requiredString } from '../body.js';
import { sessionContext } from '../sessionContext.js';
import { clearSessionCookie, setSessionCookie } from '../sessionCookie.js';

export interface AuthRoutesDeps {
  login: Pick<Login, 'execute'>;
  logout: Pick<Logout, 'execute'>;
  changeOwnPassword: Pick<ChangeOwnPassword, 'execute'>;
  clock: Clock;
  logger: Logger;
  secureCookie: boolean;
}

/**
 * `/auth/login` (pública); `/auth/logout`, `/auth/session` y `/auth/password` (con sesión, vía
 * `authMiddleware`).
 */
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

  // FEAT-007: cambio de la propia contraseña. Todo, incluido el parseo del body, dentro del `try`
  // que registra el intento (FR-09). El email del log es el de la sesión; nunca una contraseña.
  router.post('/auth/password', async (req: Request, res: Response) => {
    // El de la sesión, tomado antes del body para que un body inválido también lo registre. Sin
    // sesión, `sessionContext` lanza y el intento queda con email `null` (`''` no es un email).
    let email = '';
    try {
      const ctx = sessionContext(req);
      email = ctx.email;
      const body = bodyObject(req.body);
      // Tope de la actual acá: acota el costo de `verify` (R-03). La nueva no lleva tope de forma
      // (el body ya está acotado a 10 kb): su largo lo valida `PasswordPolicy` con su mensaje.
      const currentPassword = requiredString(body, 'currentPassword', PasswordPolicy.MAX_LENGTH);
      const newPassword = requiredString(body, 'newPassword');
      await deps.changeOwnPassword.execute({
        actor: ctx.actor,
        sessionToken: ctx.sessionToken,
        currentPassword,
        newPassword,
      });
    } catch (err) {
      logAuthAttempt(deps.logger, deps.clock, req, 'password_change', passwordChangeOutcome(err), email);
      throw err;
    }
    logAuthAttempt(deps.logger, deps.clock, req, 'password_change', 'ok', email);
    res.status(204).end();
  });

  router.get('/auth/session', (req: Request, res: Response) => {
    res.status(200).json({ user: req.user });
  });

  return router;
}

function passwordChangeOutcome(err: unknown): AuthOutcome {
  if (err instanceof IncorrectCurrentPassword) return 'wrong_current';
  if (err instanceof WeakPassword || err instanceof PasswordUnchanged || err instanceof InvalidBody) return 'invalid';
  // Incluye `Unauthenticated` por una baja o un cierre de sesión concurrentes.
  return 'error';
}
