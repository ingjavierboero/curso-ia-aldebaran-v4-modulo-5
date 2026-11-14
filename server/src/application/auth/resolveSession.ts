import type { Session } from '../../domain/auth/Session.js';
import type { SessionRepository } from '../../domain/auth/SessionRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { User } from '../../domain/user/User.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import type { SessionTokenGenerator } from './SessionTokenGenerator.js';

export interface ResolveSessionDeps {
  users: UserRepository;
  sessions: SessionRepository;
  tokens: SessionTokenGenerator;
  clock: Clock;
}

export type SessionResolution =
  | { valid: true; session: Session; user: User; now: Date }
  /** `session` es la encontrada (vencida o de un usuario inexistente o Inactivo), o null si no hay. */
  | { valid: false; session: Session | null };

/**
 * Las reglas de una sesión válida, compartidas por `AuthenticateSession` y `PeekSession` para que no
 * diverjan: existe, no venció (24 h sin actividad, FR-09) y su usuario existe y está Activo.
 * No modifica nada: borrar o renovar es decisión de quien llama.
 */
export function resolveSession(deps: ResolveSessionDeps, token: string): SessionResolution {
  const { users, sessions, tokens, clock } = deps;
  const session = sessions.findByTokenHash(tokens.hash(token));
  if (!session) return { valid: false, session: null };

  const now = clock.now();
  if (session.isExpired(now)) return { valid: false, session };

  const user = users.findById(session.userId);
  if (!user || !user.isActive()) return { valid: false, session };

  return { valid: true, session, user, now };
}
