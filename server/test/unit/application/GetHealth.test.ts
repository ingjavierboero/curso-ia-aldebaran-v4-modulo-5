import { describe, expect, it } from 'vitest';
import { GetHealth } from '../../../src/application/health/GetHealth.js';
import type { HealthEventLog } from '../../../src/application/health/HealthEventLog.js';
import { JobRegistry } from '../../../src/application/health/JobRegistry.js';
import { JobDefinition } from '../../../src/domain/health/JobDefinition.js';
import { JobRun, type JobOutcome } from '../../../src/domain/health/JobRun.js';
import type { JobRunRepository } from '../../../src/domain/health/JobRunRepository.js';
import { FakeClock } from '../../support/FakeClock.js';
import { FakeDatabaseProbe } from '../../support/FakeDatabaseProbe.js';
import { InMemoryJobRunRepository } from '../../support/InMemoryJobRunRepository.js';
import { RecordingHealthEventLog } from '../../support/RecordingHealthEventLog.js';

const HOUR = 60 * 60 * 1000;
const STARTED = new Date('2026-11-14T08:00:00.000Z');
const NOW = '2026-11-14T12:00:00.000Z';
const SECRET = 'valor-guardado-2026-13-45';

function run(id: string, jobName: string, finishedAt: string, outcome: JobOutcome): JobRun {
  const finished = new Date(finishedAt);
  return new JobRun({ id, jobName, startedAt: new Date(finished.getTime() - 1000), finishedAt: finished, outcome });
}

/** Repositorio que cuenta las consultas y falla si se las usa. */
class CountingJobRunRepository implements JobRunRepository {
  reads = 0;
  record(): void {
    throw new Error('no se graba en GetHealth');
  }
  findLatest(): JobRun | null {
    this.reads += 1;
    throw new Error('la base no responde');
  }
  findLatestSuccess(): JobRun | null {
    this.reads += 1;
    throw new Error('la base no responde');
  }
}

class StoredDateError extends Error {
  override readonly name = 'StoredDateError';
}

/** Repositorio en memoria cuya lectura falla solo para los procesos indicados. */
class FailingForJobsRepository extends InMemoryJobRunRepository {
  constructor(
    private readonly failing: ReadonlySet<string>,
    private readonly makeError: () => unknown = () => new StoredDateError(`fecha inválida: ${SECRET}`),
  ) {
    super();
  }
  override findLatest(jobName: string): JobRun | null {
    if (this.failing.has(jobName)) throw this.makeError();
    return super.findLatest(jobName);
  }
  override findLatestSuccess(jobName: string): JobRun | null {
    if (this.failing.has(jobName)) throw this.makeError();
    return super.findLatestSuccess(jobName);
  }
}

class ThrowingHealthEventLog implements HealthEventLog {
  calls = 0;
  jobReadFailed(): void {
    this.calls += 1;
    throw new Error('no se pudo escribir el log');
  }
}

function registryWith(...definitions: Array<[string, number]>): JobRegistry {
  const registry = new JobRegistry();
  for (const [name, intervalMs] of definitions) registry.register(new JobDefinition({ name, intervalMs }));
  return registry;
}

describe('GetHealth', () => {
  // AC-05: con la base caída informa degradado y no_disponible sin consultar job_runs
  it('test_get_health_con_base_caida_no_consulta_corridas', () => {
    const probe = new FakeDatabaseProbe();
    probe.available = false;
    const runs = new CountingJobRunRepository();
    const getHealth = new GetHealth({
      probe,
      runs,
      registry: registryWith(['facturacion', HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
      log: new RecordingHealthEventLog(),
    });

    const report = getHealth.execute();

    expect(report).toEqual({
      status: 'degradado',
      db: 'no_disponible',
      jobs: [{ name: 'facturacion', lastRunAt: null, lastOutcome: null, late: false, readFailed: false }],
    });
    expect(probe.calls).toBe(1);
    expect(runs.reads).toBe(0);
  });

  // AC-03: detalle por proceso registrado: nombre, última corrida, resultado y atraso
  it('test_get_health_detalle_por_proceso', () => {
    const probe = new FakeDatabaseProbe();
    const runs = new InMemoryJobRunRepository();
    // al día: corrió bien hace 30 min
    runs.record(run('r-1', 'facturacion', '2026-11-14T11:30:00.000Z', 'ok'));
    // última corrida con error, última exitosa hace 3 h con intervalo de 1 h → atrasado
    runs.record(run('r-2', 'casilla', '2026-11-14T09:00:00.000Z', 'ok'));
    runs.record(run('r-3', 'casilla', '2026-11-14T11:45:00.000Z', 'error'));
    // sin corridas: cuenta desde el arranque (hace 4 h) con intervalo de 12 h → no atrasado
    const getHealth = new GetHealth({
      probe,
      runs,
      registry: registryWith(['facturacion', HOUR], ['casilla', HOUR], ['recordatorios', 12 * HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
      log: new RecordingHealthEventLog(),
    });

    const report = getHealth.execute();

    expect(report).toEqual({
      status: 'degradado',
      db: 'disponible',
      jobs: [
        {
          name: 'facturacion',
          lastRunAt: new Date('2026-11-14T11:30:00.000Z'),
          lastOutcome: 'ok',
          late: false,
          readFailed: false,
        },
        {
          name: 'casilla',
          lastRunAt: new Date('2026-11-14T11:45:00.000Z'),
          lastOutcome: 'error',
          late: true,
          readFailed: false,
        },
        { name: 'recordatorios', lastRunAt: null, lastOutcome: null, late: false, readFailed: false },
      ],
    });
  });

  // carrera: la base se bloquea entre el sondeo y la lectura de job_runs → el proceso queda con
  // lectura fallida; la disponibilidad de la base la decide solo el sondeo (FR-05)
  it('test_get_health_lectura_de_corridas_con_error_degrada', () => {
    const probe = new FakeDatabaseProbe();
    const runs = new CountingJobRunRepository();
    const getHealth = new GetHealth({
      probe,
      runs,
      registry: registryWith(['facturacion', HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
      log: new RecordingHealthEventLog(),
    });

    expect(getHealth.execute()).toEqual({
      status: 'degradado',
      db: 'disponible',
      jobs: [{ name: 'facturacion', lastRunAt: null, lastOutcome: null, late: false, readFailed: true }],
    });
    expect(runs.reads).toBeGreaterThan(0);
  });

  it('informa ok cuando la base está disponible y ningún proceso tiene problemas', () => {
    const runs = new InMemoryJobRunRepository();
    runs.record(run('r-1', 'facturacion', '2026-11-14T11:30:00.000Z', 'ok'));
    const getHealth = new GetHealth({
      probe: new FakeDatabaseProbe(),
      runs,
      registry: registryWith(['facturacion', HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
      log: new RecordingHealthEventLog(),
    });

    expect(getHealth.execute().status).toBe('ok');
  });

  // AC-06, AC-07: solo el proceso cuya lectura falla queda degradado; los demás se evalúan con sus corridas
  it('test_get_health_lectura_fallida_marca_solo_ese_proceso', () => {
    const runs = new FailingForJobsRepository(new Set(['casilla']));
    runs.record(run('r-1', 'facturacion', '2026-11-14T11:30:00.000Z', 'ok'));
    runs.record(run('r-2', 'recordatorios', '2026-11-14T11:40:00.000Z', 'ok'));
    const getHealth = new GetHealth({
      probe: new FakeDatabaseProbe(),
      runs,
      registry: registryWith(['facturacion', HOUR], ['casilla', HOUR], ['recordatorios', HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
      log: new RecordingHealthEventLog(),
    });

    expect(getHealth.execute()).toEqual({
      status: 'degradado',
      db: 'disponible',
      jobs: [
        {
          name: 'facturacion',
          lastRunAt: new Date('2026-11-14T11:30:00.000Z'),
          lastOutcome: 'ok',
          late: false,
          readFailed: false,
        },
        { name: 'casilla', lastRunAt: null, lastOutcome: null, late: false, readFailed: true },
        {
          name: 'recordatorios',
          lastRunAt: new Date('2026-11-14T11:40:00.000Z'),
          lastOutcome: 'ok',
          late: false,
          readFailed: false,
        },
      ],
    });
  });

  // AC-08: se registra el nombre del proceso y el tipo de error (el nombre del Error, o typeof si no es uno)
  it('test_get_health_lectura_fallida_registra_nombre_y_tipo_de_error', () => {
    const log = new RecordingHealthEventLog();
    const runs = new FailingForJobsRepository(new Set(['casilla']));
    const getHealth = new GetHealth({
      probe: new FakeDatabaseProbe(),
      runs,
      registry: registryWith(['facturacion', HOUR], ['casilla', HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
      log,
    });

    getHealth.execute();

    expect(log.readFailures).toEqual([{ jobName: 'casilla', errorType: 'StoredDateError' }]);

    const nonErrorLog = new RecordingHealthEventLog();
    const nonError = new GetHealth({
      probe: new FakeDatabaseProbe(),
      runs: new FailingForJobsRepository(new Set(['facturacion']), () => 'texto suelto'),
      registry: registryWith(['facturacion', HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
      log: nonErrorLog,
    });

    nonError.execute();

    expect(nonErrorLog.readFailures).toEqual([{ jobName: 'facturacion', errorType: 'string' }]);
  });

  // AC-09: el mensaje del error (que puede traer el valor guardado) no llega ni al log ni al reporte
  it('test_get_health_lectura_fallida_no_registra_mensaje_de_error', () => {
    const log = new RecordingHealthEventLog();
    const getHealth = new GetHealth({
      probe: new FakeDatabaseProbe(),
      runs: new FailingForJobsRepository(new Set(['casilla'])),
      registry: registryWith(['casilla', HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
      log,
    });

    const report = getHealth.execute();

    expect(log.readFailures).toHaveLength(1);
    expect(JSON.stringify(log.readFailures)).not.toContain(SECRET);
    expect(JSON.stringify(log.readFailures)).not.toContain('fecha inválida');
    expect(Object.keys(log.readFailures[0] ?? {}).sort()).toEqual(['errorType', 'jobName']);
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  // un log que lanza se ignora: execute() devuelve el reporte igual
  it('test_get_health_log_que_lanza_error_no_rompe_el_reporte', () => {
    const log = new ThrowingHealthEventLog();
    const getHealth = new GetHealth({
      probe: new FakeDatabaseProbe(),
      runs: new FailingForJobsRepository(new Set(['facturacion', 'casilla'])),
      registry: registryWith(['facturacion', HOUR], ['casilla', HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
      log,
    });

    const report = getHealth.execute();

    expect(log.calls).toBe(2);
    expect(report).toEqual({
      status: 'degradado',
      db: 'disponible',
      jobs: [
        { name: 'facturacion', lastRunAt: null, lastOutcome: null, late: false, readFailed: true },
        { name: 'casilla', lastRunAt: null, lastOutcome: null, late: false, readFailed: true },
      ],
    });
  });

  // regresión FEAT-003: con el sondeo en false no se lee job_runs ni se registra nada
  it('test_get_health_base_no_disponible_no_lee_corridas', () => {
    const probe = new FakeDatabaseProbe();
    probe.available = false;
    const runs = new CountingJobRunRepository();
    const log = new RecordingHealthEventLog();
    const getHealth = new GetHealth({
      probe,
      runs,
      registry: registryWith(['facturacion', HOUR], ['casilla', HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
      log,
    });

    const report = getHealth.execute();

    expect(runs.reads).toBe(0);
    expect(log.readFailures).toEqual([]);
    expect(report).toEqual({
      status: 'degradado',
      db: 'no_disponible',
      jobs: [
        { name: 'facturacion', lastRunAt: null, lastOutcome: null, late: false, readFailed: false },
        { name: 'casilla', lastRunAt: null, lastOutcome: null, late: false, readFailed: false },
      ],
    });
  });
});
