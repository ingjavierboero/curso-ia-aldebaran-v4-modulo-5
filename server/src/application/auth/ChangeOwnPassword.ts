import type { PasswordHasher } from '../../domain/auth/PasswordHasher.js';
import { PasswordPolicy } from '../../domain/user/PasswordPolicy.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import type { Actor } from '../shared/Actor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { IncorrectCurrentPassword, Unauthenticated } from './errors.js';
import type { SessionTokenGenerator } from './SessionTokenGenerator.js';

export interface ChangeOwnPasswordDeps {
  /** Sin transacción, para la primera lectura (como `Login`). */
  users: UserRepository;
  /** Control y escritura, en una sola transacción. */
  uow: UnitOfWork;
  hasher: PasswordHasher;
  tokens: SessionTokenGenerator;
}

export interface ChangeOwnPasswordInput {
  /** El usuario de la sesión: el caso de uso nunca recibe un id objetivo (NFR-02). */
  actor: Actor;
  /** El token de la cookie de la sesión del pedido; esa sesión se conserva (FR-07). */
  sessionToken: string;
  currentPassword: string;
  newPassword: string;
}

/**
 * Cambia la contraseña del propio usuario (FEAT-007, FR-03 a FR-07). Cualquier perfil puede hacerlo:
 * no hay permiso de `Authorization`. Verifica la actual y hashea la nueva fuera de la transacción
 * (ADR-003); dentro, vuelve a controlar sesión y usuario, guarda el hash con compare-and-set contra
 * el verificado (R-04) y borra las demás sesiones del usuario.
 */
export class ChangeOwnPassword {
  constructor(private readonly deps: ChangeOwnPasswordDeps) {}

  async execute(input: ChangeOwnPasswordInput): Promise<void> {
    const { users, uow, hasher, tokens } = this.deps;
    const { actor, sessionToken, currentPassword, newPassword } = input;

    // 1. Largo de la nueva, antes de tocar la base (FR-05).
    PasswordPolicy.assert(newPassword);

    // 2. El actor debe existir y estar Activo.
    const user = users.findById(actor.id);
    if (!user || !user.isActive()) throw new Unauthenticated();

    // 3. La actual debe verificar contra el hash guardado (FR-04).
    const verifiedHash = user.passwordHash;
    if (!(await hasher.verify(verifiedHash, currentPassword))) throw new IncorrectCurrentPassword();

    // 4. La nueva debe ser distinta de la actual (FR-06).
    PasswordPolicy.assertChanged(currentPassword, newPassword);

    // 5. Hash de la nueva fuera de la transacción (ADR-003).
    const newHash = await hasher.hash(newPassword);

    // 6. Control y escritura en una sola transacción.
    uow.run(({ users: txUsers, sessions }) => {
      const session = sessions.findByTokenHash(tokens.hash(sessionToken));
      if (!session || session.userId !== actor.id) throw new Unauthenticated();

      const current = txUsers.findById(actor.id);
      if (!current || !current.isActive()) throw new Unauthenticated();
      // Compare-and-set: si cambió desde la verificación, la actual informada ya no es la vigente (R-04).
      if (current.passwordHash !== verifiedHash) throw new IncorrectCurrentPassword();

      txUsers.updatePasswordHash(current.withPasswordHash(newHash));
      sessions.deleteByUserIdExcept(current.id, session.id);
    });
  }
}
