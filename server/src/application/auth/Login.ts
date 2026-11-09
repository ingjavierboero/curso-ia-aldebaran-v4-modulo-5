import type { PasswordHasher } from '../../domain/auth/PasswordHasher.js';
import { Session } from '../../domain/auth/Session.js';
import type { SessionRepository } from '../../domain/auth/SessionRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import { Email } from '../../domain/user/Email.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import { type PublicUser, toPublicUser } from './dto/PublicUser.js';
import { InvalidCredentials } from './errors.js';
import type { SessionTokenGenerator } from './SessionTokenGenerator.js';

export interface LoginDeps {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  tokens: SessionTokenGenerator;
  ids: IdGenerator;
  clock: Clock;
  /** Hash calculado al arrancar; se verifica contra él cuando el email no existe (R-02). */
  dummyHash: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: PublicUser;
}

export class Login {
  constructor(private readonly deps: LoginDeps) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const { users, sessions, hasher, tokens, ids, clock, dummyHash } = this.deps;
    const email = Email.create(input.email);
    const user = users.findByEmail(email);

    if (!user) {
      // Mismo costo que un usuario existente, para no revelar qué emails existen (R-02).
      await hasher.verify(dummyHash, input.password);
      throw new InvalidCredentials();
    }

    const passwordMatches = await hasher.verify(user.passwordHash, input.password);
    if (!passwordMatches || !user.isActive()) throw new InvalidCredentials();

    const now = clock.now();
    const { token, tokenHash } = tokens.generate();
    sessions.insert(
      new Session({ id: ids.next(), userId: user.id, tokenHash, createdAt: now, lastActivityAt: now }),
    );

    return { token, user: toPublicUser(user) };
  }
}
