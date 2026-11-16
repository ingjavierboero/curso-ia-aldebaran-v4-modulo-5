import type { PasswordHasher } from '../../domain/auth/PasswordHasher.js';
import type { PasswordResetTokenRepository } from '../../domain/auth/PasswordResetTokenRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import { PasswordPolicy } from '../../domain/user/PasswordPolicy.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { findUsableResetToken } from './CheckPasswordResetToken.js';
import { InvalidResetToken } from './errors.js';
import type { SessionTokenGenerator } from './SessionTokenGenerator.js';

export interface ResetPasswordWithTokenDeps {
  /** Sin transacción, para el control previo al hash (como `ChangeOwnPassword`). */
  users: UserRepository;
  resetTokens: PasswordResetTokenRepository;
  /** Relectura y escritura, en una sola transacción. */
  uow: UnitOfWork;
  hasher: PasswordHasher;
  resetTokenGenerator: SessionTokenGenerator;
  clock: Clock;
}

export interface ResetPasswordWithTokenInput {
  token: string;
  newPassword: string;
}

/**
 * Define una contraseña nueva con el enlace de recuperación (FEAT-008, FR-07, FR-12, FR-13, D-01).
 * Largo de la nueva primero (una inválida deja el token como estaba), después el mismo control que
 * `CheckPasswordResetToken`; hash fuera de la transacción (ADR-003); dentro, relee token y usuario,
 * marca el token como usado (compare-and-set), guarda el hash, anula los demás tokens del usuario y
 * cierra todas sus sesiones.
 */
export class ResetPasswordWithToken {
  constructor(private readonly deps: ResetPasswordWithTokenDeps) {}

  async execute(input: ResetPasswordWithTokenInput): Promise<void> {
    const { users, resetTokens, uow, hasher, resetTokenGenerator, clock } = this.deps;
    const { token, newPassword } = input;

    // 1. Largo de la nueva, antes de mirar el token (AC-10).
    PasswordPolicy.assert(newPassword);

    // 2. Control previo: no se hashea con un token que ya no sirve.
    findUsableResetToken({ users, resetTokens }, resetTokenGenerator, token, clock.now());

    // 3. Hash fuera de la transacción (ADR-003).
    const newHash = await hasher.hash(newPassword);

    // 4. Relectura y escritura en una sola transacción.
    uow.run(({ users: txUsers, sessions, resetTokens: txResetTokens }) => {
      const now = clock.now();
      const { resetToken, user } = findUsableResetToken(
        { users: txUsers, resetTokens: txResetTokens },
        resetTokenGenerator,
        token,
        now,
      );
      // Defensa en profundidad: no debería ocurrir bajo IMMEDIATE, porque la relectura de arriba ya
      // ve un token consumido por otra confirmación. Si `markUsed` no lo marca, no se cambia nada.
      if (!txResetTokens.markUsed(resetToken.id, now)) throw new InvalidResetToken();

      txUsers.updatePasswordHash(user.withPasswordHash(newHash));
      txResetTokens.invalidateAllForUser(user.id, now);
      sessions.deleteByUserId(user.id);
    });
  }
}
