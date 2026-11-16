import type { PasswordResetLog } from '../../application/auth/PasswordResetLog.js';
import type { Clock } from '../../domain/shared/Clock.js';
// `Logger` vive en `http/authLog.ts`; moverlo a `logging/` queda como deuda (spec FEAT-004, Block 2).
import type { AuthEvent, AuthOutcome, Logger } from '../http/authLog.js';

/** Los literales de la línea, atados a los tipos del log de autenticación (FEAT-008, Block 4). */
const EVENT = 'password_reset_request' satisfies AuthEvent;
const SENT = 'sent' satisfies AuthOutcome;
const SEND_FAILED = 'send_failed' satisfies AuthOutcome;

/**
 * Adaptador de `PasswordResetLog` sobre el logger estructurado (FEAT-008, FR-18): una línea por
 * pedido cuando termina el envío, `{ event: 'password_reset_request', outcome: 'sent' | 'send_failed',
 * email, errorCode?, at }`. Nunca el token, la URL ni el texto del email (NFR-01, AC-16). Nunca
 * lanza: si el logger falla, el evento se descarta.
 */
export function createPasswordResetLog(logger: Logger, clock: Clock): PasswordResetLog {
  return {
    delivered: ({ email }) => {
      try {
        logger.info({ event: EVENT, outcome: SENT, email, at: clock.now().toISOString() });
      } catch {
        // Contrato del puerto: no hay a dónde informar que no se pudo informar.
      }
    },
    deliveryFailed: ({ email, errorCode }) => {
      try {
        logger.error({
          event: EVENT,
          outcome: SEND_FAILED,
          email,
          errorCode,
          at: clock.now().toISOString(),
        });
      } catch {
        // Contrato del puerto: no hay a dónde informar que no se pudo informar.
      }
    },
  };
}
