import type { SessionRepository } from '../../domain/auth/SessionRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import { type PublicUser, toPublicUser } from './dto/PublicUser.js';
import { Unauthenticated } from './errors.js';
import { resolveSession } from './resolveSession.js';
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
    const { sessions } = this.deps;
    const result = resolveSession(this.deps, token);
    if (!result.valid) {
      if (result.session) sessions.delete(result.session.id);
      throw new Unauthenticated();
    }

    sessions.touch(result.session.id, result.now);
    return toPublicUser(result.user);
  }
}
