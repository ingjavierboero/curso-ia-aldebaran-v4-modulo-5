import type { Request } from 'express';
import { Unauthenticated } from '../../application/auth/errors.js';
import type { Actor } from '../../application/shared/Actor.js';

export interface SessionContext {
  /** El usuario de la sesión como `Actor` de los casos de uso. */
  actor: Actor;
  /** El email de la sesión (ya normalizado), para el log de autenticación. */
  email: string;
  /** El token de la cookie ya validado. Nunca se loguea. */
  sessionToken: string;
}

/**
 * Lo que `authMiddleware` dejó en la solicitud: usuario y token de la sesión. El middleware lo
 * garantiza en toda ruta no pública; si faltara, `Unauthenticated` (401) y no un 500.
 */
export function sessionContext(req: Request): SessionContext {
  if (req.user === undefined || req.sessionToken === undefined) throw new Unauthenticated();
  return {
    actor: { id: req.user.id, role: req.user.role },
    email: req.user.email,
    sessionToken: req.sessionToken,
  };
}
