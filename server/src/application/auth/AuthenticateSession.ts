import type { SessionRepository } from '../../domain/auth/SessionRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import { type PublicUser, toPublicUser } from './dto/PublicUser.js';
import { Unauthenticated } from './errors.js';
import type { SessionTokenGenerator } from './SessionTokenGenerator.js';

export interface AuthenticateSessionDeps {
  users: UserRepository;
  sessions: SessionRepository;
  tokens: SessionTokenGenerator;
  clock: Clock;
}

/**
 * Valida el token de sesión. Una sesión vencida (24 h sin actividad, FR-09) o de un usuario
 * inexistente o Inactivo se borra; si es válida, se renueva su última actividad (deslizante).
 */
export class AuthenticateSession {
  constructor(private readonly deps: AuthenticateSessionDeps) {}

  execute(token: string): PublicUser {
    const { users, sessions, tokens, clock } = this.deps;
    const session = sessions.findByTokenHash(tokens.hash(token));
    if (!session) throw new Unauthenticated();

    const now = clock.now();
    if (session.isExpired(now)) {
      sessions.delete(session.id);
      throw new Unauthenticated();
    }

    const user = users.findById(session.userId);
    if (!user || !user.isActive()) {
      sessions.delete(session.id);
      throw new Unauthenticated();
    }

    sessions.touch(session.id, now);
    return toPublicUser(user);
  }
}
