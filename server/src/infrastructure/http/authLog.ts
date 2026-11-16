import type { Request } from 'express';
import type { Clock } from '../../domain/shared/Clock.js';
import { Email } from '../../domain/shared/Email.js';
import { InvalidEmail } from '../../domain/shared/errors.js';

export type LogRecord = Record<string, unknown>;

/** Logger estructurado. Nunca recibe contraseñas ni tokens (R-05). */
export interface Logger {
  info(record: LogRecord): void;
  error(record: LogRecord): void;
}

/** Una línea JSON por registro, con `level`. Por defecto escribe en stdout. */
export function createJsonLogger(write: (line: string) => void = (line) => process.stdout.write(line)): Logger {
  const emit = (level: 'info' | 'error', record: LogRecord): void => {
    write(`${JSON.stringify({ level, ...record })}\n`);
  };
  return {
    info: (record) => {
      emit('info', record);
    },
    error: (record) => {
      emit('error', record);
    },
  };
}

export type AuthEvent =
  | 'login'
  | 'first_admin'
  | 'password_change'
  // FEAT-008: pedido del enlace de recuperación y cambio de contraseña con el enlace.
  | 'password_reset_request'
  | 'password_reset_confirm';
/**
 * `blocked`: la compuerta del límite de intentos rechazó el pedido con 429 (FEAT-009).
 * FEAT-008: `sent`/`send_failed` (resultado del envío del enlace, los escribe `PasswordResetLog`),
 * `no_user` (email inválido o sin usuario Activo), `throttled` (dentro de los 5 minutos) e
 * `invalid_token` (enlace inexistente, vencido, usado o anulado).
 */
export type AuthOutcome =
  | 'ok'
  | 'invalid'
  | 'conflict'
  | 'wrong_current'
  | 'error'
  | 'blocked'
  | 'sent'
  | 'no_user'
  | 'throttled'
  | 'send_failed'
  | 'invalid_token';

/** El email normalizado por `Email.create`, o `null` si no es un email válido (`InvalidEmail`). */
function loggableEmail(rawEmail: string): string | null {
  try {
    return Email.create(rawEmail).value;
  } catch (err) {
    if (err instanceof InvalidEmail) return null;
    throw err;
  }
}

/**
 * Registra un intento de login, de registro del primer Admin o de cambio de la propia contraseña
 * (R-05, FEAT-007 FR-09): `{ event, outcome, email, ip, at }`. En `password_change` el email es el de
 * la sesión y `wrong_current` indica que la contraseña actual no verificó. El email se registra
 * normalizado (trim + minúsculas). Uno inválido no tiene forma normalizada y se registra como
 * `null`: así una contraseña escrita en el campo email no queda en el log. Ninguna contraseña (ni la
 * actual ni la nueva) y ningún token se pasan nunca.
 */
export function logAuthAttempt(
  logger: Logger,
  clock: Clock,
  req: Request,
  event: AuthEvent,
  outcome: AuthOutcome,
  rawEmail: string,
): void {
  logger.info({
    event,
    outcome,
    email: loggableEmail(rawEmail),
    ip: req.ip ?? null,
    at: clock.now().toISOString(),
  });
}
