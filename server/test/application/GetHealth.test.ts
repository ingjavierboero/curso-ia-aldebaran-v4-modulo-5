import { describe, expect, it } from 'vitest';
import { GetHealth } from '../../src/application/health/GetHealth.js';
import { JobRegistry } from '../../src/application/health/JobRegistry.js';
import { JobDefinition } from '../../src/domain/health/JobDefinition.js';
import { JobRun, type JobOutcome } from '../../src/domain/health/JobRun.js';
import type { JobRunRepository } from '../../src/domain/health/JobRunRepository.js';
import { FakeClock } from '../support/FakeClock.js';
import { FakeDatabaseProbe } from '../support/FakeDatabaseProbe.js';
import { InMemoryJobRunRepository } from '../support/InMemoryJobRunRepository.js';

const HOUR = 60 * 60 * 1000;
const STARTED = new Date('2026-11-14T08:00:00.000Z');
const NOW = '2026-11-14T12:00:00.000Z';

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
    });

    const report = getHealth.execute();

    expect(report).toEqual({
      status: 'degradado',
      db: 'no_disponible',
      jobs: [{ name: 'facturacion', lastRunAt: null, lastOutcome: null, late: false }],
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
        },
        {
          name: 'casilla',
          lastRunAt: new Date('2026-11-14T11:45:00.000Z'),
          lastOutcome: 'error',
          late: true,
        },
        { name: 'recordatorios', lastRunAt: null, lastOutcome: null, late: false },
      ],
    });
  });

  // carrera: la base se bloquea entre el sondeo y la lectura de job_runs → degradado, sin lanzar
  it('test_get_health_lectura_de_corridas_con_error_degrada', () => {
    const probe = new FakeDatabaseProbe();
    const runs = new CountingJobRunRepository();
    const getHealth = new GetHealth({
      probe,
      runs,
      registry: registryWith(['facturacion', HOUR]),
      clock: new FakeClock(NOW),
      systemStartedAt: STARTED,
    });

    expect(getHealth.execute()).toEqual({
      status: 'degradado',
      db: 'no_disponible',
      jobs: [{ name: 'facturacion', lastRunAt: null, lastOutcome: null, late: false }],
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
    });

    expect(getHealth.execute().status).toBe('ok');
  });
});
