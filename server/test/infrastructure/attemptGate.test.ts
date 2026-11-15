import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Logger, LogRecord } from '../../src/infrastructure/http/authLog.js';
import { AttemptTracker } from '../../src/infrastructure/http/rateLimit/AttemptTracker.js';
import { attemptKey, bodyEmailOf, createAttemptGate } from '../../src/infrastructure/http/rateLimit/attemptGate.js';
import { FakeClock } from '../support/FakeClock.js';

interface Harness {
  app: Express;
  clock: FakeClock;
  tracker: AttemptTracker;
  logs: LogRecord[];
  /** Cuántas veces llegó el pedido al handler de la ruta (detrás de la compuerta). */
  handlerCalls: () => number;
}

/**
 * App mínima: compuerta de `login` y una ruta que siempre rechaza las credenciales y, como harán
 * las rutas reales, informa el fallo confirmado al registro.
 */
function buildHarness(options: { stripIp?: boolean } = {}): Harness {
  const clock = new FakeClock('2026-11-15T12:00:00.000Z');
  const tracker = new AttemptTracker(clock);
  const logs: LogRecord[] = [];
  const logger: Logger = {
    info: (record) => logs.push(record),
    error: (record) => logs.push(record),
  };
  let calls = 0;

  const app = express();
  app.use(express.json());
  if (options.stripIp === true) {
    const stripIp: RequestHandler = (req, _res, next) => {
      Object.defineProperty(req, 'ip', { value: undefined, configurable: true });
      next();
    };
    app.use(stripIp);
  }
  app.post('/login', createAttemptGate({ operation: 'login', tracker, clock, logger, emailOf: bodyEmailOf }), (req, res) => {
    calls += 1;
    tracker.fail(attemptKey(req));
    res.status(401).json({ error: 'Credenciales incorrectas' });
  });

  return { app, clock, tracker, logs, handlerCalls: () => calls };
}

async function failFiveTimes(h: Harness): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const res = await request(h.app).post('/login').send({ email: 'ana@example.com', password: 'mala' });
    expect(res.status).toBe(401);
  }
}

describe('attemptGate', () => {
  let warnSpy: MockInstance<typeof console.warn>;
  let errorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Las validaciones de express-rate-limit v8 avisan por consola: ninguna debe dispararse.
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('test_attempt_gate_bloqueado_rechazado_429', async () => {
    const h = buildHarness();
    await failFiveTimes(h);
    h.clock.advance(50_000); // quedan 14 min 10 s de bloqueo

    const res = await request(h.app).post('/login').send({ email: 'ana@example.com', password: 'buena' });

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('850');
    expect(res.body).toEqual({ error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' });
    expect(res.headers['ratelimit-limit']).toBeUndefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    expect(h.handlerCalls()).toBe(5);
    const record = h.logs.at(-1);
    expect(Object.keys(record ?? {}).sort()).toEqual(['at', 'email', 'event', 'ip', 'outcome']);
    expect(record).toMatchObject({
      event: 'login',
      outcome: 'blocked',
      email: 'ana@example.com',
      at: '2026-11-15T12:00:50.000Z',
    });
    expect(typeof record?.['ip']).toBe('string');
  });

  it('test_attempt_gate_body_invalido_registra_bloqueo', async () => {
    const h = buildHarness();
    await failFiveTimes(h);

    const arrayBody = await request(h.app).post('/login').send([1, 2]);
    const textBody = await request(h.app).post('/login').set('Content-Type', 'text/plain').send('ana@example.com');

    expect(arrayBody.status).toBe(429);
    expect(textBody.status).toBe(429);
    expect(h.handlerCalls()).toBe(5);
    const blocked = h.logs.filter((r) => r.outcome === 'blocked');
    expect(blocked).toHaveLength(2);
    for (const record of blocked) {
      expect(record).toMatchObject({ event: 'login', outcome: 'blocked', email: null });
    }
  });

  it('test_attempt_gate_ip_faltante_rechazado', async () => {
    const h = buildHarness({ stripIp: true });
    await failFiveTimes(h);

    const res = await request(h.app).post('/login').send({ email: 'ana@example.com', password: 'buena' });

    expect(res.status).toBe(429);
    expect(h.handlerCalls()).toBe(5);
    expect(h.tracker.check('').blocked).toBe(true);
    expect(h.logs.at(-1)).toMatchObject({ event: 'login', outcome: 'blocked', ip: null });
  });
});
