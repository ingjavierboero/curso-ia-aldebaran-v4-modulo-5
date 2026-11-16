import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { CheckPasswordResetToken } from '../../../application/auth/CheckPasswordResetToken.js';
import { InvalidResetToken } from '../../../application/auth/errors.js';
import type { RequestPasswordReset } from '../../../application/auth/RequestPasswordReset.js';
import type { ResetPasswordWithToken } from '../../../application/auth/ResetPasswordWithToken.js';
import type { Clock } from '../../../domain/shared/Clock.js';
import { Email } from '../../../domain/user/Email.js';
import { WeakPassword } from '../../../domain/user/errors.js';
import { type AuthOutcome, type Logger, logAuthAttempt } from '../authLog.js';
import { bodyObject, InvalidBody, requiredString } from '../body.js';
import type { AttemptTracker } from '../rateLimit/AttemptTracker.js';
import { attemptKey } from '../rateLimit/attemptGate.js';

/** Respuesta fija del pedido: no revela si el email corresponde a un usuario (FR-05). */
export const PASSWORD_RESET_REQUEST_MESSAGE =
  'Si el email corresponde a un usuario activo, te enviamos un enlace para definir una nueva contraseña. Revisá tu casilla.';

/** Tope del token antes de llegar al caso de uso (el real tiene 43 caracteres). */
const RESET_TOKEN_MAX_LENGTH = 64;

export interface PasswordResetRoutesDeps {
  requestPasswordReset: Pick<RequestPasswordReset, 'execute'>;
  checkPasswordResetToken: Pick<CheckPasswordResetToken, 'execute'>;
  resetPasswordWithToken: Pick<ResetPasswordWithToken, 'execute'>;
  clock: Clock;
  logger: Logger;
  /** Compuerta del límite de pedidos de enlace (FEAT-008, FR-14, D-05): la crea `createApp`. */
  resetRequestGate: RequestHandler;
  /** Registro de pedidos de enlace: cuenta todo pedido que pasó la compuerta; nunca `succeed`. */
  resetRequestTracker: AttemptTracker;
  /** Compuerta del chequeo del enlace; comparte `resetConfirmTracker` con la confirmación. */
  resetCheckGate: RequestHandler;
  /** Compuerta de la confirmación con el enlace (FR-16). */
  resetConfirmGate: RequestHandler;
  /** Registro de enlaces inválidos (check + confirm): solo `InvalidResetToken` cuenta; nunca `succeed`. */
  resetConfirmTracker: AttemptTracker;
}

/**
 * Recuperación de contraseña (FEAT-008), las tres públicas (`PUBLIC_ROUTES`):
 * `POST /auth/password-reset`, `POST /auth/password-reset/check` y `POST /auth/password-reset/confirm`.
 * Cada una lleva su compuerta del límite de intentos antes del handler (ADR-006): bloqueada, responde
 * 429 sin ejecutar el caso de uso. Ningún token ni contraseña llega al log.
 */
export function passwordResetRoutes(deps: PasswordResetRoutesDeps): Router {
  const router = Router();
  const { resetRequestGate, resetRequestTracker, resetCheckGate, resetConfirmGate, resetConfirmTracker } = deps;

  router.post('/auth/password-reset', resetRequestGate, (req: Request, res: Response) => {
    // Primero, antes de parsear: todo pedido que pasó la compuerta cuenta, aun con body inválido
    // (D-05: el 5.º bloquea y el 6.º recibe 429). Un pedido nunca reinicia el conteo.
    resetRequestTracker.fail(attemptKey(req));
    const body = bodyObject(req.body);
    const email = requiredString(body, 'email', Email.MAX_LENGTH);

    const result = deps.requestPasswordReset.execute(email);
    // Con `issued`, la línea la escribe `PasswordResetLog` cuando termina el envío (una por pedido).
    if (result !== 'issued') logAuthAttempt(deps.logger, deps.clock, req, 'password_reset_request', result, email);

    res.status(200).json({ message: PASSWORD_RESET_REQUEST_MESSAGE });
  });

  router.post('/auth/password-reset/check', resetCheckGate, (req: Request, res: Response) => {
    const body = bodyObject(req.body);
    const token = requiredString(body, 'token', RESET_TOKEN_MAX_LENGTH);
    try {
      deps.checkPasswordResetToken.execute(token);
    } catch (err) {
      // Solo un enlace inválido cuenta; un acierto no reinicia el conteo (FR-16).
      if (err instanceof InvalidResetToken) resetConfirmTracker.fail(attemptKey(req));
      throw err;
    }
    res.status(204).end();
  });

  router.post('/auth/password-reset/confirm', resetConfirmGate, async (req: Request, res: Response) => {
    try {
      const body = bodyObject(req.body);
      const token = requiredString(body, 'token', RESET_TOKEN_MAX_LENGTH);
      // Sin tope de forma: el largo lo valida `PasswordPolicy` en el caso de uso (el body ya está
      // acotado a 10 kb).
      const newPassword = requiredString(body, 'newPassword');
      await deps.resetPasswordWithToken.execute({ token, newPassword });
    } catch (err) {
      // Solo un enlace inválido cuenta; una contraseña nueva inválida no (AC-10).
      if (err instanceof InvalidResetToken) resetConfirmTracker.fail(attemptKey(req));
      // Sin sesión ni email en el pedido: el email del log queda `null`.
      logAuthAttempt(deps.logger, deps.clock, req, 'password_reset_confirm', confirmOutcome(err), '');
      throw err;
    }
    logAuthAttempt(deps.logger, deps.clock, req, 'password_reset_confirm', 'ok', '');
    res.status(204).end();
  });

  return router;
}

function confirmOutcome(err: unknown): AuthOutcome {
  if (err instanceof InvalidResetToken) return 'invalid_token';
  if (err instanceof WeakPassword || err instanceof InvalidBody) return 'invalid';
  return 'error';
}
