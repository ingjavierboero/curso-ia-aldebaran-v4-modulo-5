import type { Request } from 'express';
import type { Clock } from '../../domain/shared/Clock.js';
import { Email } from '../../domain/user/Email.js';
import { InvalidEmail } from '../../domain/user/errors.js';

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

export type AuthEvent = 'login' | 'first_admin';
export type AuthOutcome = 'ok' | 'invalid' | 'conflict' | 'error';

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
 * Registra un intento de login o de registro del primer Admin (R-05): `{ event, outcome, email, ip, at }`.
 * El email se registra normalizado (trim + minúsculas). Uno inválido no tiene forma normalizada y se
 * registra como `null`: así una contraseña escrita en el campo email no queda en el log. La
 * contraseña y el token no se pasan nunca.
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
