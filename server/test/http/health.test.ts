import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PeekSession } from '../../src/application/auth/PeekSession.js';
import { GetHealth } from '../../src/application/health/GetHealth.js';
import { CryptoSessionTokenGenerator } from '../../src/infrastructure/auth/CryptoSessionTokenGenerator.js';
import { DrizzleSessionRepository } from '../../src/infrastructure/db/DrizzleSessionRepository.js';
import { DrizzleUserRepository } from '../../src/infrastructure/db/DrizzleUserRepository.js';
import { schema } from '../../src/infrastructure/db/schema.js';
import { JobDefinition } from '../../src/domain/health/JobDefinition.js';
import { JobRun } from '../../src/domain/health/JobRun.js';
import { SqliteDatabaseProbe } from '../../src/infrastructure/db/SqliteDatabaseProbe.js';
import { createApp } from '../../src/infrastructure/http/app.js';
import { type TestApp, createTestApp, sessionCookieFrom } from '../support/testApp.js';

const HOUR = 60 * 60 * 1000;
const PASSWORD = 'contraseña-segura';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(() => {
  t.cleanup();
});

async function loginCookie(): Promise<string> {
  await t.seedUser({ email: 'admin@empresa.com' });
  const res = await request(t.app).post('/api/auth/login').send({ email: 'admin@empresa.com', password: PASSWORD });
  expect(res.status).toBe(200);
  return sessionCookieFrom(res.headers['set-cookie']) as string;
}

/** Registra `facturacion` (cada 1 h) con una corrida que terminó hace `agoMs` con `outcome`. */
function seedFacturacion(outcome: 'ok' | 'error', agoMs = 10 * 60 * 1000): Date {
  t.jobRegistry.register(new JobDefinition({ name: 'facturacion', intervalMs: HOUR }));
  const finishedAt = new Date(t.clock.now().getTime() - agoMs);
  t.jobRuns.record(
    new JobRun({ id: 'run-1', jobName: 'facturacion', startedAt: new Date(finishedAt.getTime() - 1000), finishedAt, outcome }),
  );
  return finishedAt;
}

describe('GET /api/health', () => {
  // AC-01 / NFR-02: sin sesión y todo sano, 200 con exactamente {status:"ok"}
  it('test_health_sin_sesion_ok_200_solo_status', async () => {
    seedFacturacion('ok');

    const res = await request(t.app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(Object.keys(res.body as object)).toEqual(['status']);
    expect(res.text).not.toContain('facturacion');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  // AC-02 / NFR-03: sin sesión y algo degradado, 503 con exactamente {status:"degradado"}
  it('test_health_sin_sesion_degradado_503_solo_status', async () => {
    seedFacturacion('error');

    const res = await request(t.app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degradado' });
    expect(res.text).not.toContain('facturacion');
  });

  // AC-03: con sesión válida, estado general, base y detalle por proceso
  it('test_health_con_sesion_trae_detalle', async () => {
    const cookie = await loginCookie();
    const finishedAt = seedFacturacion('ok');

    const res = await request(t.app).get('/api/health').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      db: 'disponible',
      jobs: [{ name: 'facturacion', lastRunAt: finishedAt.toISOString(), lastOutcome: 'ok', late: false }],
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('con sesión y un proceso sin corridas: lastRunAt y lastOutcome null; degradado da 503 con detalle', async () => {
    const cookie = await loginCookie();
    t.jobRegistry.register(new JobDefinition({ name: 'casilla', intervalMs: HOUR }));
    t.clock.advance(3 * HOUR);

    const res = await request(t.app).get('/api/health').set('Cookie', cookie);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'degradado',
      db: 'disponible',
      jobs: [{ name: 'casilla', lastRunAt: null, lastOutcome: null, late: true }],
    });
  });

  // AC-04 / R-01 / R-05: cookie inválida o vencida → respuesta anónima, sin 401, sin Set-Cookie, sin log
  it('test_health_cookie_invalida_rechazada_responde_anonimo_sin_401', async () => {
    const invented = await request(t.app).get('/api/health').set('Cookie', 'aldebaran_sid=inventado');

    expect(invented.status).toBe(200);
    expect(invented.body).toEqual({ status: 'ok' });
    expect(invented.headers['set-cookie']).toBeUndefined();

    const cookie = await loginCookie();
    t.clock.advance(24 * HOUR);
    const expired = await request(t.app).get('/api/health').set('Cookie', cookie);

    expect(expired.status).toBe(200);
    expect(expired.body).toEqual({ status: 'ok' });
    expect(expired.headers['set-cookie']).toBeUndefined();
    expect(t.logs.filter((l) => l.record.event === 'session_rejected')).toEqual([]);
  });

  it('con sesión, la consulta de salud no renueva la última actividad', async () => {
    const cookie = await loginCookie();

    t.clock.advance(23 * HOUR);
    const health = await request(t.app).get('/api/health').set('Cookie', cookie);
    expect(health.status).toBe(200);
    expect(health.body).toHaveProperty('db', 'disponible');

    t.clock.advance(2 * HOUR);
    const session = await request(t.app).get('/api/auth/session').set('Cookie', cookie);
    expect(session.status).toBe(401);
  });

  it('si validar la sesión falla, responde como anónima, nunca 500, y loguea health_session_check_failed sin detalle', async () => {
    t.cleanup();
    t = await createTestApp({
      peekSession: {
        execute: () => {
          throw new Error('SQLITE_BUSY: database is locked');
        },
      },
    });

    const res = await request(t.app).get('/api/health').set('Cookie', 'aldebaran_sid=cualquiera');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.text).not.toContain('SQLITE');
    expect(res.headers['set-cookie']).toBeUndefined();
    const failed = t.logs.filter((l) => l.record.event === 'health_session_check_failed');
    expect(failed).toEqual([
      { level: 'error', record: { event: 'health_session_check_failed', at: t.clock.now().toISOString() } },
    ]);
    expect(JSON.stringify(t.logs)).not.toContain('cualquiera');
    expect(JSON.stringify(t.logs)).not.toContain('SQLITE');
  });

  // R-06: con sesión, una variante de la ruta no llega al handler (y no devuelve el estado)
  it('test_health_variante_con_sesion_no_llega_al_handler', async () => {
    const cookie = await loginCookie();
    let calls = 0;
    const app = createApp({
      ...t.deps,
      getHealth: {
        execute: () => {
          calls += 1;
          return { status: 'ok', db: 'disponible', jobs: [] };
        },
      },
    });

    for (const path of ['/api/health/', '/API/HEALTH', '/api/Health', '/API/health']) {
      const res = await request(app).get(path).set('Cookie', cookie);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'No encontrado' });
    }
    expect(calls).toBe(0);

    const exact = await request(app).get('/api/health').set('Cookie', cookie);
    expect(exact.status).toBe(200);
    expect(calls).toBe(1);
  });

  // AC-05 / AC-14 / NFR-01: base bloqueada → 503 degradado en menos de 1 s, nunca 500
  it('test_health_base_caida_503_en_menos_de_un_segundo', async () => {
    const probe = new SqliteDatabaseProbe(t.db.$client.name);
    const app = createApp({
      ...t.deps,
      getHealth: new GetHealth({
        probe,
        runs: t.jobRuns,
        registry: t.jobRegistry,
        clock: t.clock,
        systemStartedAt: t.clock.now(),
      }),
    });
    const locker = t.db.$client;
    locker.pragma('locking_mode = EXCLUSIVE');
    locker.exec('BEGIN EXCLUSIVE');
    locker.exec('CREATE TABLE lock_probe (x INTEGER); INSERT INTO lock_probe VALUES (1)');

    try {
      const started = performance.now();
      const res = await request(app).get('/api/health');
      const elapsed = performance.now() - started;

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'degradado' });
      expect(elapsed).toBeLessThan(1000);
    } finally {
      locker.exec('ROLLBACK');
      locker.pragma('locking_mode = NORMAL');
      locker.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
      probe.close();
    }
  });

  // AC-05 / AC-14: con cookie válida y la base bloqueada desde OTRA conexión, 503 anónimo en < 1 s
  it('test_health_base_caida_con_cookie_503_anonimo_en_menos_de_un_segundo', async () => {
    const cookie = await loginCookie();
    const path = t.db.$client.name;
    // Una conexión no se bloquea a sí misma: el lock lo toma una conexión aparte sobre el mismo archivo.
    // En WAL, ese lock EXCLUSIVE no se puede tomar mientras otra conexión ya leyó la base (SQLITE_BUSY):
    // se cierra la conexión del login y la "conexión compartida" de la app es una nueva sobre el mismo
    // archivo, abierta antes del lock y usada recién en la consulta (como la del server frente a otro
    // proceso que tomó la base).
    t.db.$client.close();
    const shared = new Database(path);
    const sharedDb = drizzle({ client: shared, schema });
    const locker = new Database(path);
    locker.pragma('locking_mode = EXCLUSIVE');
    locker.exec('BEGIN EXCLUSIVE');
    locker.exec('CREATE TABLE lock_probe (x INTEGER); INSERT INTO lock_probe VALUES (1)');
    const probe = new SqliteDatabaseProbe(path);
    const app = createApp({
      ...t.deps,
      getHealth: new GetHealth({
        probe,
        runs: t.jobRuns,
        registry: t.jobRegistry,
        clock: t.clock,
        systemStartedAt: t.clock.now(),
      }),
      peekSession: new PeekSession({
        users: new DrizzleUserRepository(sharedDb),
        sessions: new DrizzleSessionRepository(sharedDb),
        tokens: new CryptoSessionTokenGenerator(),
        clock: t.clock,
      }),
    });

    try {
      const started = performance.now();
      const res = await request(app).get('/api/health').set('Cookie', cookie);
      const elapsed = performance.now() - started;

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'degradado' });
      expect(elapsed).toBeLessThan(1000);
    } finally {
      locker.exec('ROLLBACK');
      locker.close();
      probe.close();
      shared.close();
    }
  }, 15_000);

  it('con sesión y la base no disponible, responde la anónima sin consultar PeekSession', async () => {
    const cookie = await loginCookie();
    seedFacturacion('ok');
    t.probe.available = false;
    let peeks = 0;
    const app = createApp({
      ...t.deps,
      peekSession: {
        execute: (token: string) => {
          peeks += 1;
          return t.deps.peekSession.execute(token);
        },
      },
    });

    const res = await request(app).get('/api/health').set('Cookie', cookie);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degradado' });
    expect(peeks).toBe(0);
  });
});

describe('HEAD /api/health', () => {
  // AC-02: HEAD responde el mismo código sin body
  it('test_health_head_responde_codigo_sin_body', async () => {
    const ok = await request(t.app).head('/api/health');

    expect(ok.status).toBe(200);
    expect(ok.text ?? '').toBe('');

    t.probe.available = false;
    const degraded = await request(t.app).head('/api/health');

    expect(degraded.status).toBe(503);
    expect(degraded.text ?? '').toBe('');
  });
});
