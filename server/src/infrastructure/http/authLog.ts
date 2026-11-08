import type { Request } from 'express';
import type { Clock } from '../../domain/shared/Clock.js';

export type LogRecord = Record<string, unknown>;

/** Logger estructurado. Nunca recibe contraseñas ni tokens (R-05). */
export interface Logger {
  info(record: LogRecord): void;
  error(record: LogRecord): void;
}

/** Una línea JSON por registro, con `level`. Por defecto escribe en stdout. */
export function createJsonLogger(write: (line: string) => void = (line) => process.stdout.write(line)): Logger {
  const emit = (level: 'info' | 'error', record: LogRecord) => write(`${JSON.stringify({ level, ...record })}\n`);
  return {
    info: (record) => emit('info', record),
    error: (record) => emit('error', record),
  };
}

export type AuthEvent = 'login' | 'first_admin';
export type AuthOutcome = 'ok' | 'invalid' | 'conflict' | 'error';

/**
 * Registra un intento de login o de registro del primer Admin (R-05): `{ event, outcome, email, ip, at }`.
 * El email se registra normalizado (trim + minúsculas); la contraseña y el token no se pasan nunca.
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
    email: rawEmail.trim().toLowerCase(),
    ip: req.ip ?? null,
    at: clock.now().toISOString(),
  });
}
