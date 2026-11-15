import {
  type AttemptState,
  emptyAttemptState,
  isBlocked,
  isIdle,
  recordFailure,
} from '../../../domain/auth/AttemptWindow.js';
import type { Clock } from '../../../domain/shared/Clock.js';

/** Resultado de consultar una clave. */
export interface AttemptCheck {
  blocked: boolean;
  blockedUntil: Date | null;
}

/** Como máximo un barrido por minuto, según el `Clock`. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Registro en memoria de los intentos de una operación (FEAT-009, ADR-006), por clave de IP. Solo
 * cuentan los fallos que la ruta confirma con `fail`; un acierto (`succeed`) borra la clave. Vive en
 * memoria y se pierde con el reinicio (D-05). Un barrido amortizado, dentro de `check` y `fail`,
 * descarta las claves sin fallos en la ventana ni bloqueo vigente, para que la memoria no crezca
 * con IPs que ya no intentan (NFR-03).
 */
export class AttemptTracker {
  private readonly states = new Map<string, AttemptState>();
  private lastSweepAt: number;

  constructor(private readonly clock: Clock) {
    this.lastSweepAt = clock.now().getTime();
  }

  /** Si la clave está bloqueada y hasta cuándo. */
  check(key: string): AttemptCheck {
    const now = this.clock.now().getTime();
    this.sweep(now);
    const state = this.states.get(key);
    if (state !== undefined && isBlocked(state, now) && state.blockedUntil !== null) {
      return { blocked: true, blockedUntil: new Date(state.blockedUntil) };
    }
    return { blocked: false, blockedUntil: null };
  }

  /** Registra un fallo confirmado (credenciales o contraseña actual incorrectas, registro rechazado). */
  fail(key: string): void {
    const now = this.clock.now().getTime();
    this.sweep(now);
    this.states.set(key, recordFailure(this.states.get(key) ?? emptyAttemptState(), now));
  }

  /** Un acierto reinicia la clave (FR-08). */
  succeed(key: string): void {
    this.states.delete(key);
  }

  /** Cantidad de claves guardadas. */
  size(): number {
    return this.states.size;
  }

  private sweep(now: number): void {
    if (now - this.lastSweepAt < SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = now;
    for (const [key, state] of this.states) {
      if (isIdle(state, now)) this.states.delete(key);
    }
  }
}
