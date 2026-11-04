import type { SessionRepository } from '../../domain/auth/SessionRepository.js';
import type { SessionTokenGenerator } from './SessionTokenGenerator.js';

export interface LogoutDeps {
  sessions: SessionRepository;
  tokens: SessionTokenGenerator;
}

/** Borra la sesión del token (FR-04). Idempotente: un token inexistente no es un error. */
export class Logout {
  constructor(private readonly deps: LogoutDeps) {}

  execute(token: string): void {
    const { sessions, tokens } = this.deps;
    const session = sessions.findByTokenHash(tokens.hash(token));
    if (session) sessions.delete(session.id);
  }
}
