import { Router, type Request, type Response } from 'express';
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

export interface SetupRoutesDeps {
  getSetupStatus: Pick<GetSetupStatus, 'execute'>;
  registerFirstAdmin: Pick<RegisterFirstAdmin, 'execute'>;
  clock: Clock;
  logger: Logger;
}

/**
 * Ambas públicas. `GET /setup/status` es la excepción documentada de FR-01: solo el booleano.
 * `POST /setup/first-admin` no inicia sesión; con usuarios existentes, 409 (FR-06).
 */
export function setupRoutes(deps: SetupRoutesDeps): Router {
  const router = Router();

  router.get('/setup/status', (_req: Request, res: Response) => {
    const { needsFirstAdmin } = deps.getSetupStatus.execute();
    res.status(200).json({ needsFirstAdmin });
  });

  router.post('/setup/first-admin', async (req: Request, res: Response) => {
    const body = bodyObject(req.body);
    // Acá, tipo y máximos; el dominio aplica el resto: nombre de 1 a 100 tras el trim (`parseUserName`),
    // formato del email y mínimo de 8 (`PasswordPolicy`).
    const name = requiredString(body, 'name', USER_NAME_MAX_LENGTH);
    const email = requiredString(body, 'email', Email.MAX_LENGTH);
    const password = requiredString(body, 'password', PasswordPolicy.MAX_LENGTH);

    let user;
    try {
      user = await deps.registerFirstAdmin.execute({ name, email, password });
    } catch (err) {
      logAuthAttempt(deps.logger, deps.clock, req, 'first_admin', outcomeOf(err), email);
      throw err;
    }
    logAuthAttempt(deps.logger, deps.clock, req, 'first_admin', 'ok', email);

    res.status(201).json({ user });
  });

  return router;
}

function outcomeOf(err: unknown): AuthOutcome {
  if (err instanceof FirstAdminAlreadyExists) return 'conflict';
  if (err instanceof WeakPassword || err instanceof InvalidEmail || err instanceof InvalidName) return 'invalid';
  return 'error';
}
