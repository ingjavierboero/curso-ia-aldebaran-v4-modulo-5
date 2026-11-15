import { describe, expect, it } from 'vitest';
import {
  type AttemptState,
  BLOCK_MS,
  emptyAttemptState,
  isBlocked,
  MAX_FAILURES,
  recordFailure,
  retryAfterMinutes,
  WINDOW_MS,
} from '../../src/domain/auth/AttemptWindow.js';

const MIN = 60_000;
const t0 = new Date('2026-11-15T12:00:00.000Z').getTime();

/** Registra un fallo en cada instante de `times`, partiendo de `state`. */
function failAt(state: AttemptState, times: readonly number[]): AttemptState {
  return times.reduce((acc, at) => recordFailure(acc, at), state);
}

describe('AttemptWindow', () => {
  it('test_attempt_window_bloquea_en_el_quinto_fallo', () => {
    expect(MAX_FAILURES).toBe(5);
    const times = [t0, t0 + 1 * MIN, t0 + 2 * MIN, t0 + 3 * MIN, t0 + 10 * MIN];

    const afterFour = failAt(emptyAttemptState(), times.slice(0, 4));
    expect(isBlocked(afterFour, t0 + 10 * MIN)).toBe(false);

    const afterFive = recordFailure(afterFour, t0 + 10 * MIN);
    expect(afterFive.blockedUntil).toBe(t0 + 10 * MIN + 15 * MIN);
    expect(isBlocked(afterFive, t0 + 10 * MIN)).toBe(true);
  });

  it('test_attempt_window_bloqueo_vence_a_los_15_minutos', () => {
    expect(BLOCK_MS).toBe(15 * MIN);
    const fifth = t0 + 4 * MIN;
    const state = failAt(emptyAttemptState(), [t0, t0 + MIN, t0 + 2 * MIN, t0 + 3 * MIN, fifth]);

    expect(isBlocked(state, fifth + 15 * MIN - 1)).toBe(true);
    expect(isBlocked(state, fifth + 15 * MIN)).toBe(false);
  });

  it('test_attempt_window_fallo_viejo_fuera_de_ventana', () => {
    expect(WINDOW_MS).toBe(15 * MIN);
    // El primero queda a más de 15 min del quinto intento.
    const state = failAt(emptyAttemptState(), [t0, t0 + 6 * MIN, t0 + 7 * MIN, t0 + 8 * MIN]);
    const next = recordFailure(state, t0 + 15 * MIN + 1);

    expect(next.blockedUntil).toBeNull();
    expect(isBlocked(next, t0 + 15 * MIN + 1)).toBe(false);
    expect(next.failures).toHaveLength(4);

    // Con los cuatro dentro de la ventana, el siguiente sí bloquea: el viejo era el que no contaba.
    const blocked = recordFailure(next, t0 + 16 * MIN);
    expect(isBlocked(blocked, t0 + 16 * MIN)).toBe(true);
  });

  it('un fallo de exactamente WINDOW_MS de antigüedad todavía cuenta; uno de WINDOW_MS + 1 ms, no', () => {
    const firstFour = failAt(emptyAttemptState(), [t0, t0 + MIN, t0 + 2 * MIN, t0 + 3 * MIN]);

    const atBoundary = recordFailure(firstFour, t0 + WINDOW_MS);
    expect(isBlocked(atBoundary, t0 + WINDOW_MS)).toBe(true);

    const pastBoundary = recordFailure(firstFour, t0 + WINDOW_MS + 1);
    expect(isBlocked(pastBoundary, t0 + WINDOW_MS + 1)).toBe(false);
  });

  it('test_attempt_window_intento_bloqueado_rechazado_sin_registrar', () => {
    const fifth = t0 + 4 * MIN;
    const blocked = failAt(emptyAttemptState(), [t0, t0 + MIN, t0 + 2 * MIN, t0 + 3 * MIN, fifth]);

    const afterBlockedAttempt = recordFailure(blocked, fifth + 5 * MIN);
    expect(afterBlockedAttempt).toEqual(blocked);
    expect(isBlocked(afterBlockedAttempt, fifth + 5 * MIN)).toBe(true);

    // Al vencer el bloqueo, 4 fallos no bloquean: los intentos bloqueados no sumaron.
    const unblockedAt = fifth + 15 * MIN;
    const afterFour = failAt(afterBlockedAttempt, [unblockedAt, unblockedAt + 1, unblockedAt + 2, unblockedAt + 3]);
    expect(isBlocked(afterFour, unblockedAt + 3)).toBe(false);
  });

  it('test_attempt_window_retry_after_redondea_hacia_arriba', () => {
    expect(retryAfterMinutes(14 * MIN + 10_000)).toBe(15);
    expect(retryAfterMinutes(15 * MIN)).toBe(15);
    expect(retryAfterMinutes(1)).toBe(1);
    expect(retryAfterMinutes(0)).toBe(1);
  });
});
