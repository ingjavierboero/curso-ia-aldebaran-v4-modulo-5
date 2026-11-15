import { Router, type Request, type RequestHandler, type Response } from 'express';
import { FirstAdminAlreadyExists } from '../../../application/auth/errors.js';
import type { GetSetupStatus } from '../../../application/auth/GetSetupStatus.js';
import type { RegisterFirstAdmin } from '../../../application/auth/RegisterFirstAdmin.js';
import type { Clock } from '../../../domain/shared/Clock.js';
import { Email } from '../../../domain/user/Email.js';
import { InvalidEmail, InvalidName, WeakPassword } from '../../../domain/user/errors.js';
import { PasswordPolicy } from '../../../domain/user/PasswordPolicy.js';
import { USER_NAME_MAX_LENGTH } from '../../../domain/user/User.js';
import { type AuthOutcome, type Logger, logAuthAttempt } from '../authLog.js';
import { bodyObject, requiredString } from '../body.js';
import type { AttemptTracker } from '../rateLimit/AttemptTracker.js';
import { attemptKey } from '../rateLimit/attemptGate.js';

export interface SetupRoutesDeps {
  getSetupStatus: Pick<GetSetupStatus, 'execute'>;
  registerFirstAdmin: Pick<RegisterFirstAdmin, 'execute'>;
  clock: Clock;
  logger: Logger;
  /** Compuerta del límite de intentos del registro del primer Admin (FEAT-009): la crea `createApp`. */
  firstAdminGate: RequestHandler;
  /** Registro de fallos del primer Admin: cualquier rechazo de la ruta cuenta (FR-04). */
  firstAdminTracker: AttemptTracker;
}

/**
 * Ambas públicas. `GET /setup/status` es la excepción documentada de FR-01: solo el booleano.
 * `POST /setup/first-admin` no inicia sesión; con usuarios existentes, 409 (FR-06).
 */
export function setupRoutes(deps: SetupRoutesDeps): Router {
  const router = Router();
  const { firstAdminGate, firstAdminTracker } = deps;

  router.get('/setup/status', (_req: Request, res: Response) => {
    const { needsFirstAdmin } = deps.getSetupStatus.execute();
    res.status(200).json({ needsFirstAdmin });
  });

  // FEAT-009: la compuerta corre antes del handler; bloqueada, responde 429 sin contar un fallo ni ejecutar
  // el caso de uso (el rechazo queda en el log como `blocked`).
  router.post('/setup/first-admin', firstAdminGate, async (req: Request, res: Response) => {
    // El parseo va dentro del `try`: cualquier rechazo de la ruta cuenta como fallo (FR-04). Solo
    // se registra en el log el intento que llegó al caso de uso, como hasta ahora.
    let input: { name: string; email: string; password: string } | undefined;
    let user;
    try {
      const body = bodyObject(req.body);
      // Acá, tipo y máximos; el dominio aplica el resto: nombre de 1 a 100 tras el trim
      // (`parseUserName`), formato del email y mínimo de 8 (`PasswordPolicy`).
      input = {
        name: requiredString(body, 'name', USER_NAME_MAX_LENGTH),
        email: requiredString(body, 'email', Email.MAX_LENGTH),
        password: requiredString(body, 'password', PasswordPolicy.MAX_LENGTH),
      };
      user = await deps.registerFirstAdmin.execute(input);
    } catch (err) {
      firstAdminTracker.fail(attemptKey(req));
      if (input !== undefined) logAuthAttempt(deps.logger, deps.clock, req, 'first_admin', outcomeOf(err), input.email);
      throw err;
    }
    firstAdminTracker.succeed(attemptKey(req));
    logAuthAttempt(deps.logger, deps.clock, req, 'first_admin', 'ok', input.email);

    res.status(201).json({ user });
  });

  return router;
}

function outcomeOf(err: unknown): AuthOutcome {
  if (err instanceof FirstAdminAlreadyExists) return 'conflict';
  if (err instanceof WeakPassword || err instanceof InvalidEmail || err instanceof InvalidName) return 'invalid';
  return 'error';
}
