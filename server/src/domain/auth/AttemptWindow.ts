/**
 * Regla del límite de intentos (FEAT-009, ADR-006): se bloquea en el momento del 5.º fallo
 * confirmado dentro de 15 minutos, durante 15 minutos contados desde ese fallo. Funciones puras
 * sobre marcas de tiempo en milisegundos; el estado lo guarda quien la usa.
 */

/** Fallos dentro de la ventana que disparan el bloqueo. */
export const MAX_FAILURES = 5;
/** Ventana deslizante en la que se cuentan los fallos. */
export const WINDOW_MS = 15 * 60_000;
/** Duración del bloqueo, desde el fallo que lo dispara. */
export const BLOCK_MS = 15 * 60_000;

/**
 * Estado de una clave: las marcas de los fallos recientes (como máximo `MAX_FAILURES - 1`; se vacía
 * al bloquear) y el fin del bloqueo, si hay uno.
 */
export interface AttemptState {
  readonly failures: readonly number[];
  readonly blockedUntil: number | null;
}

/** Estado sin fallos ni bloqueo. */
export function emptyAttemptState(): AttemptState {
  return { failures: [], blockedUntil: null };
}

/** Si hay un bloqueo vigente en `now`. Vence exactamente en `blockedUntil`. */
export function isBlocked(state: AttemptState, now: number): boolean {
  return state.blockedUntil !== null && now < state.blockedUntil;
}

/**
 * Los fallos que siguen dentro de la ventana en `now`: se descartan los de más de `WINDOW_MS`, así
 * que uno de exactamente `WINDOW_MS` de antigüedad todavía cuenta.
 */
function failuresInWindow(state: AttemptState, now: number): number[] {
  return state.failures.filter((at) => now - at <= WINDOW_MS);
}

/**
 * Registra un fallo confirmado en `now`. Un intento bloqueado nunca se registra: devuelve el mismo
 * estado. Si con este fallo quedan `MAX_FAILURES` dentro de la ventana, bloquea por `BLOCK_MS`.
 */
export function recordFailure(state: AttemptState, now: number): AttemptState {
  if (isBlocked(state, now)) return state;
  const failures = [...failuresInWindow(state, now), now];
  if (failures.length >= MAX_FAILURES) {
    return { failures: [], blockedUntil: now + BLOCK_MS };
  }
  return { failures, blockedUntil: null };
}

/** Sin bloqueo vigente y sin fallos dentro de la ventana: la clave se puede descartar. */
export function isIdle(state: AttemptState, now: number): boolean {
  return !isBlocked(state, now) && failuresInWindow(state, now).length === 0;
}

/** Minutos de espera que se informan al usuario: redondeados hacia arriba, como mínimo 1. */
export function retryAfterMinutes(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / 60_000));
}
