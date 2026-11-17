import { describe, expect, it, vi } from 'vitest';
import { JobRunNotRecorded, UnknownJob } from '../../../src/application/health/errors.js';
import { JobRegistry } from '../../../src/application/health/JobRegistry.js';
import { RunTrackedJob } from '../../../src/application/health/RunTrackedJob.js';
import { JobDefinition } from '../../../src/domain/health/JobDefinition.js';
import { JobRun } from '../../../src/domain/health/JobRun.js';
import type { JobRunRepository } from '../../../src/domain/health/JobRunRepository.js';
import { FakeClock } from '../../support/FakeClock.js';
import { InMemoryJobRunRepository } from '../../support/InMemoryJobRunRepository.js';
import { SequentialIdGenerator } from '../../support/SequentialIdGenerator.js';

const HOUR = 60 * 60 * 1000;
const START = '2026-11-14T15:00:00.000Z';

function setup(runs: JobRunRepository = new InMemoryJobRunRepository()) {
  const registry = new JobRegistry();
  registry.register(new JobDefinition({ name: 'facturacion', intervalMs: HOUR }));
  const clock = new FakeClock(START);
  const ids = new SequentialIdGenerator('run');
  const tracked = new RunTrackedJob({ registry, runs, ids, clock });
  return { registry, clock, ids, tracked };
}

/** Repositorio cuya grabación siempre falla. */
class FailingJobRunRepository implements JobRunRepository {
  constructor(readonly error: Error) {}
  record(): void {
    throw this.error;
  }
  findLatest(): JobRun | null {
    return null;
  }
  findLatestSuccess(): JobRun | null {
    return null;
  }
}

describe('RunTrackedJob', () => {
  // AC-09: al terminar la corrida se graban inicio, fin y resultado, en una sola escritura
  it('test_run_tracked_job_graba_inicio_fin_y_resultado', async () => {
    const runs = new InMemoryJobRunRepository();
    const { clock, tracked } = setup(runs);
    const recordedDuringJob: number[] = [];

    const result = await tracked.run('facturacion', async () => {
      recordedDuringJob.push(runs.all().length);
      await Promise.resolve();
      clock.advance(5000);
      return 42;
    });

    expect(result).toBe(42);
    expect(recordedDuringJob).toEqual([0]);
    expect(runs.all()).toEqual([
      new JobRun({
        id: 'run-1',
        jobName: 'facturacion',
        startedAt: new Date(START),
        finishedAt: new Date('2026-11-14T15:00:05.000Z'),
        outcome: 'ok',
      }),
    ]);
  });

  it('acepta un job síncrono', async () => {
    const runs = new InMemoryJobRunRepository();
    const { tracked } = setup(runs);

    await expect(tracked.run('facturacion', () => 'listo')).resolves.toBe('listo');
    expect(runs.all().map((r) => r.outcome)).toEqual(['ok']);
  });

  // AC-07: un nombre no registrado se rechaza antes de correr y no se graba nada
  it('test_run_tracked_job_nombre_no_registrado_rechazado', async () => {
    const runs = new InMemoryJobRunRepository();
    const { tracked } = setup(runs);
    const fn = vi.fn(() => 'no debería correr');

    await expect(tracked.run('desconocido', fn)).rejects.toBeInstanceOf(UnknownJob);
    expect(fn).not.toHaveBeenCalled();
    expect(runs.all()).toEqual([]);
  });

  // AC-06: el error del job se graba como 'error' (sin su mensaje, R-07) y se relanza el original
  it('test_run_tracked_job_error_del_job_se_graba_y_se_relanza', async () => {
    const runs = new InMemoryJobRunRepository();
    const { clock, tracked } = setup(runs);
    const jobError = new Error('cliente 20-12345678-9 sin saldo');

    await expect(
      tracked.run('facturacion', async () => {
        await Promise.resolve();
        clock.advance(1000);
        throw jobError;
      }),
    ).rejects.toBe(jobError);

    const all = runs.all();
    expect(all).toEqual([
      new JobRun({
        id: 'run-1',
        jobName: 'facturacion',
        startedAt: new Date(START),
        finishedAt: new Date('2026-11-14T15:00:01.000Z'),
        outcome: 'error',
      }),
    ]);
    expect(JSON.stringify(all)).not.toContain('sin saldo');
  });

  // AC-09: un fallo al grabar no oculta el error del job; si el job anduvo, se rechaza con
  // JobRunNotRecorded (causa: el error de grabación), distinto de un fallo del job
  it('test_run_tracked_job_falla_de_grabacion_no_oculta_error_del_job', async () => {
    const recordError = new Error('disk I/O error');
    const { tracked } = setup(new FailingJobRunRepository(recordError));
    const jobError = new Error('falló el job');

    await expect(
      tracked.run('facturacion', () => {
        throw jobError;
      }),
    ).rejects.toBe(jobError);

    const rejection: unknown = await tracked.run('facturacion', () => 'ok').then(
      () => null,
      (err: unknown) => err,
    );
    expect(rejection).toBeInstanceOf(JobRunNotRecorded);
    expect((rejection as JobRunNotRecorded).cause).toBe(recordError);
  });
});
