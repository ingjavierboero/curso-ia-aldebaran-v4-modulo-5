import { canIssueResetToken, PasswordResetToken } from '../../domain/auth/PasswordResetToken.js';
import type { PasswordResetTokenRepository } from '../../domain/auth/PasswordResetTokenRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import { Email } from '../../domain/shared/Email.js';
import { InvalidEmail } from '../../domain/shared/errors.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import type { EmailSender } from '../shared/EmailSender.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import type { PasswordResetLog } from './PasswordResetLog.js';
import type { SessionTokenGenerator } from './SessionTokenGenerator.js';

export const PASSWORD_RESET_SUBJECT = 'Recuperación de contraseña de Aldebaran';

export type RequestPasswordResetResult = 'issued' | 'no_user' | 'throttled';

export interface RequestPasswordResetDeps {
  /** Sin transacción, para buscar al usuario por email. */
  users: UserRepository;
  /** Sin transacción, para el control previo del enfriamiento. */
  resetTokens: PasswordResetTokenRepository;
  /** Relectura del usuario, enfriamiento y emisión del token, en una sola transacción. */
  uow: UnitOfWork;
  /** Instancia propia de `SessionTokenGenerator` para los tokens de recuperación. */
  resetTokenGenerator: SessionTokenGenerator;
  ids: IdGenerator;
  clock: Clock;
  emailSender: EmailSender;
  resetLog: PasswordResetLog;
  /** Dirección base de la web, ya validada y sin barra final (FR-03). */
  appUrl: string;
}

/**
 * Pide la recuperación de contraseña (FEAT-008, FR-02 a FR-05, FR-08, FR-15). Con un usuario Activo
 * fuera del enfriamiento emite un token nuevo (anulando los anteriores) y dispara el email sin
 * esperarlo; el resultado del envío lo registra `PasswordResetLog`. Nunca revela al llamador si el
 * email existe más allá del resultado, que la ruta no muestra.
 */
export class RequestPasswordReset {
  constructor(private readonly deps: RequestPasswordResetDeps) {}

  execute(rawEmail: string): RequestPasswordResetResult {
    const { users, resetTokens, uow, resetTokenGenerator, ids, clock, appUrl } = this.deps;

    // 1. Email válido de un usuario Activo (FR-05).
    let email: Email;
    try {
      email = Email.create(rawEmail);
    } catch (err) {
      if (err instanceof InvalidEmail) return 'no_user';
      throw err;
    }
    const user = users.findByEmail(email);
    if (!user || !user.isActive()) return 'no_user';

    // 2. Enfriamiento de 5 minutos, antes de generar nada y sin abrir transacción (FR-15).
    const now = clock.now();
    if (!canIssueResetToken(resetTokens.latestCreatedAtForUser(user.id), now)) return 'throttled';

    // 3. Token nuevo; en la transacción se vuelven a controlar el usuario y el enfriamiento.
    const { token, tokenHash } = resetTokenGenerator.generate();
    const outcome = uow.run(({ users: txUsers, resetTokens: txResetTokens }): RequestPasswordResetResult => {
      const current = txUsers.findById(user.id);
      if (!current || !current.isActive()) return 'no_user';
      if (!canIssueResetToken(txResetTokens.latestCreatedAtForUser(user.id), now)) return 'throttled';
      txResetTokens.deleteExpiredForUser(user.id, now);
      txResetTokens.invalidateAllForUser(user.id, now);
      txResetTokens.insert(PasswordResetToken.issue({ id: ids.next(), userId: user.id, tokenHash, now }));
      return 'issued';
    });
    if (outcome !== 'issued') return outcome;

    // 4. El email sale sin esperarlo (NFR-03); su resultado va al log (FR-04, D-03).
    this.deliver(user.id, user.email.value, `${appUrl}/recuperar/${token}`);
    return 'issued';
  }

  private deliver(userId: string, to: string, url: string): void {
    const { emailSender, resetLog } = this.deps;
    const text = [
      'Para definir una nueva contraseña de Aldebaran, entrá a este enlace:',
      url,
      '',
      'El enlace vence en 10 minutos. Si no pediste el cambio, ignorá este email.',
    ].join('\n');

    // El log nunca debería lanzar; si lo hace, se descarta el evento: ni rechazos sin manejar ni
    // efectos sobre el pedido.
    const onDelivered = (): void => {
      try {
        resetLog.delivered({ userId, email: to });
      } catch {
        // descartado
      }
    };
    const onFailed = (err: unknown): void => {
      try {
        resetLog.deliveryFailed({ userId, email: to, errorCode: errorCodeOf(err) });
      } catch {
        // descartado
      }
    };

    let sending: Promise<void>;
    try {
      sending = emailSender.send({ to, subject: PASSWORD_RESET_SUBJECT, text });
    } catch (err) {
      // Un adaptador que lanza en vez de rechazar se registra igual que un rechazo, con lo lanzado.
      onFailed(err);
      return;
    }
    void sending.then(onDelivered, onFailed);
  }
}

/** `err.code` si es string; si no, `err.name`; si no hay ninguno, `UnknownError`. Nunca el mensaje. */
function errorCodeOf(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const { code, name } = err as { code?: unknown; name?: unknown };
    if (typeof code === 'string' && code.length > 0) return code;
    if (typeof name === 'string' && name.length > 0) return name;
  }
  return 'UnknownError';
}
