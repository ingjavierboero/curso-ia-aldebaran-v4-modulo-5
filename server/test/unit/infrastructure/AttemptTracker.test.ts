import { describe, expect, it } from 'vitest';
import { AttemptTracker } from '../../../src/infrastructure/http/rateLimit/AttemptTracker.js';
import { FakeClock } from '../../support/FakeClock.js';

const MIN = 60_000;

describe('AttemptTracker', () => {
  it('test_attempt_tracker_succeed_reinicia', () => {
    const clock = new FakeClock('2026-11-15T12:00:00.000Z');
    const tracker = new AttemptTracker(clock);
    const key = '203.0.113.7';

    for (let i = 0; i < 4; i++) tracker.fail(key);
    tracker.succeed(key);
    for (let i = 0; i < 4; i++) tracker.fail(key);

    expect(tracker.check(key)).toEqual({ blocked: false, blockedUntil: null });

    // Control: el quinto fallo después del reinicio sí bloquea.
    tracker.fail(key);
    expect(tracker.check(key)).toEqual({ blocked: true, blockedUntil: new Date('2026-11-15T12:15:00.000Z') });
  });

  it('test_attempt_tracker_barrido_descarta_inactivas', () => {
    const clock = new FakeClock('2026-11-15T12:00:00.000Z');
    const tracker = new AttemptTracker(clock);

    for (let i = 0; i < 5; i++) tracker.fail('198.51.100.1'); // bloqueada hasta 12:15
    tracker.fail('198.51.100.2'); // un fallo, sale de la ventana a las 12:15
    expect(tracker.size()).toBe(2);

    clock.advance(31 * MIN);
    tracker.check('198.51.100.3');

    expect(tracker.size()).toBe(0);
  });

  it('el barrido conserva las claves vivas y check sobre una clave desconocida no la inserta', () => {
    const clock = new FakeClock('2026-11-15T12:00:00.000Z');
    const tracker = new AttemptTracker(clock);

    tracker.fail('198.51.100.9'); // fallo a las 12:00: queda inactiva a las 12:16
    clock.advance(10 * MIN);
    for (let i = 0; i < 5; i++) tracker.fail('198.51.100.1'); // bloqueada hasta 12:25
    clock.advance(4 * MIN); // 12:14 (este fail barre, pero la de 12:00 sigue en la ventana)
    tracker.fail('198.51.100.2'); // fallo reciente, dentro de la ventana
    expect(tracker.size()).toBe(3);

    clock.advance(2 * MIN); // 12:16, pasado el intervalo de barrido
    expect(tracker.check('198.51.100.3')).toEqual({ blocked: false, blockedUntil: null });

    expect(tracker.size()).toBe(2);
    expect(tracker.check('198.51.100.1')).toEqual({ blocked: true, blockedUntil: new Date('2026-11-15T12:25:00.000Z') });
    expect(tracker.size()).toBe(2);
  });
});
