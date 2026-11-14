import type { SessionRepository } from '../../domain/auth/SessionRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import { type PublicUser, toPublicUser } from './dto/PublicUser.js';
import { resolveSession } from './resolveSession.js';
import type { SessionTokenGenerator } from './SessionTokenGenerator.js';

export interface PeekSessionDeps {
  users: UserRepository;
  sessions: SessionRepository;
  tokens: SessionTokenGenerator;
  clock: Clock;
}

/**
 * Valida el token con las mismas reglas que `AuthenticateSession` (función compartida
 * `resolveSession`), pero estrictamente de solo lectura: no renueva la última actividad ni borra
 * sesiones (R-06). Token vacío, inexistente, vencido o de usuario inexistente o Inactivo → `null`.
 */
export class PeekSession {
  constructor(private readonly deps: PeekSessionDeps) {}

  execute(token: string): PublicUser | null {
    if (typeof token !== 'string' || token.length === 0) return null;
    const result = resolveSession(this.deps, token);
    return result.valid ? toPublicUser(result.user) : null;
  }
}
