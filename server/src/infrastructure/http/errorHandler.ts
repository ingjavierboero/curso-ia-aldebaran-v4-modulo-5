import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { FirstAdminAlreadyExists, InvalidCredentials, Unauthenticated } from '../../application/auth/errors.js';
import type { Clock } from '../../domain/shared/Clock.js';
import { InvalidEmail, InvalidName, WeakPassword } from '../../domain/user/errors.js';
import type { Logger } from './authLog.js';
import { InvalidBody } from './body.js';
import { clearSessionCookie } from './sessionCookie.js';

export interface ErrorHandlerDeps {
  logger: Logger;
  clock: Clock;
  secureCookie: boolean;
}

/**
 * Error de `express.json` (JSON mal formado, body demasiado grande, charset…): trae `type` y un
 * status 4xx. Devuelve ese status, o `null` si no es un error del parser.
 */
function bodyParserStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const { type, status } = err as { type?: unknown; status?: unknown };
  if (typeof type !== 'string' || typeof status !== 'number' || status < 400 || status >= 500) return null;
  return status;
}

/** Mensajes fijos por status del parser; el resto de los 4xx se informa como JSON inválido (400). */
const BODY_PARSER_ERRORS: Readonly<Record<number, string>> = {
  413: 'El body es demasiado grande',
  // El mismo mensaje que `requireJson` (R-07).
  415: 'Content-Type debe ser application/json',
};

/**
 * Mapeo único de errores a HTTP. Lo no reconocido es 500 `{ error: "Error interno" }`, sin stack ni
 * mensaje: el detalle va solo al log.
 */
export function createErrorHandler(deps: ErrorHandlerDeps): ErrorRequestHandler {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof InvalidBody || err instanceof WeakPassword || err instanceof InvalidEmail || err instanceof InvalidName) {
      res.status(400).json({ error: err.message });
      return;
    }
    const parserStatus = bodyParserStatus(err);
    if (parserStatus !== null) {
      const message = BODY_PARSER_ERRORS[parserStatus];
      if (message !== undefined) res.status(parserStatus).json({ error: message });
      else res.status(400).json({ error: 'El body no es un JSON válido' });
      return;
    }
    if (err instanceof InvalidCredentials) {
      res.status(401).json({ error: 'Email o contraseña incorrectos' });
      return;
    }
    if (err instanceof Unauthenticated) {
      clearSessionCookie(res, deps.secureCookie);
      res.status(401).json({ error: 'Sesión no válida' });
      return;
    }
    if (err instanceof FirstAdminAlreadyExists) {
      res.status(409).json({ error: err.message });
      return;
    }

    deps.logger.error({
      event: 'unexpected_error',
      method: req.method,
      path: req.originalUrl.split('?')[0],
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      at: deps.clock.now().toISOString(),
    });
    if (res.headersSent) return;
    res.status(500).json({ error: 'Error interno' });
  };
}
