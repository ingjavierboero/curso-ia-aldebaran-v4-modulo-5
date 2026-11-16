import type { PasswordResetToken } from '../../domain/auth/PasswordResetToken.js';
import type { PasswordResetTokenRepository } from '../../domain/auth/PasswordResetTokenRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { User } from '../../domain/user/User.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import { InvalidResetToken } from './errors.js';
import type { SessionTokenGenerator } from './SessionTokenGenerator.js';

/** 32 bytes en base64url: exactamente 43 caracteres de `A-Z a-z 0-9 _ -`. */
const RESET_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/**
 * Busca el token por su hash y exige que sea usable y de un usuario Activo; si no, `InvalidResetToken`.
 * Con formato inválido ni siquiera calcula el hash. Síncrona: sirve también dentro de `uow.run`.
 */
export function findUsableResetToken(
  repos: { users: UserRepository; resetTokens: PasswordResetTokenRepository },
  generator: SessionTokenGenerator,
  token: string,
  now: Date,
): { resetToken: PasswordResetToken; user: User } {
  if (typeof token !== 'string' || !RESET_TOKEN_FORMAT.test(token)) throw new InvalidResetToken();
  const resetToken = repos.resetTokens.findByTokenHash(generator.hash(token));
  if (!resetToken || !resetToken.isUsable(now)) throw new InvalidResetToken();
  const user = repos.users.findById(resetToken.userId);
  if (!user || !user.isActive()) throw new InvalidResetToken();
  return { resetToken, user };
}

export interface CheckPasswordResetTokenDeps {
  /** Sin transacción: es solo una lectura. */
  users: UserRepository;
  resetTokens: PasswordResetTokenRepository;
  /** La instancia propia de los tokens de recuperación (solo se usa `hash`). */
  resetTokenGenerator: SessionTokenGenerator;
  clock: Clock;
}

/**
 * Controla que el enlace de recuperación todavía sirva (FEAT-008, FR-09, FR-10): formato, existencia,
 * vencimiento, uso, anulación y usuario Activo. No modifica nada.
 */
export class CheckPasswordResetToken {
  constructor(private readonly deps: CheckPasswordResetTokenDeps) {}

  execute(token: string): void {
    const { users, resetTokens, resetTokenGenerator, clock } = this.deps;
    findUsableResetToken({ users, resetTokens }, resetTokenGenerator, token, clock.now());
  }
}
