import { afterEach, describe, expect, it } from 'vitest';
import { JobRun, type JobOutcome } from '../../../src/domain/health/JobRun.js';
import type { JobRunRepository } from '../../../src/domain/health/JobRunRepository.js';
import { DrizzleJobRunRepository } from '../../../src/infrastructure/db/DrizzleJobRunRepository.js';
import { InMemoryJobRunRepository } from '../../support/InMemoryJobRunRepository.js';
import { createTestDb, type TestDb } from '../../support/sqliteTestDb.js';

interface RunSpec {
  id: string;
  jobName?: string;
  startedAt: string;
  finishedAt: string;
  outcome: JobOutcome;
}

function makeRun(spec: RunSpec): JobRun {
  return new JobRun({
    id: spec.id,
    jobName: spec.jobName ?? 'facturacion',
    startedAt: new Date(spec.startedAt),
    finishedAt: new Date(spec.finishedAt),
    outcome: spec.outcome,
  });
}

const opened: TestDb[] = [];

const implementations: [string, () => JobRunRepository][] = [
  ['InMemoryJobRunRepository', () => new InMemoryJobRunRepository()],
  [
    'DrizzleJobRunRepository',
    () => {
      const t = createTestDb();
      opened.push(t);
      return new DrizzleJobRunRepository(t.db);
    },
  ],
];

// El doble en memoria y el repositorio real cumplen el mismo contrato del puerto.
describe.each(implementations)('contrato JobRunRepository — %s', (_name, create) => {
  afterEach(() => {
    for (const t of opened.splice(0)) t.cleanup();
  });

  it('findLatest y findLatestSuccess devuelven null sin corridas', () => {
    const repo = create();

    expect(repo.findLatest('facturacion')).toBeNull();
    expect(repo.findLatestSuccess('facturacion')).toBeNull();
  });

  it('findLatest devuelve la de mayor finished_at sin importar el resultado ni el orden de grabación', () => {
    const repo = create();
    repo.record(makeRun({ id: 'r-1', startedAt: '2026-11-14T09:59:00.000Z', finishedAt: '2026-11-14T10:00:00.000Z', outcome: 'ok' }));
    repo.record(makeRun({ id: 'r-3', startedAt: '2026-11-14T11:59:00.000Z', finishedAt: '2026-11-14T12:00:00.000Z', outcome: 'error' }));
    repo.record(makeRun({ id: 'r-2', startedAt: '2026-11-14T10:59:00.000Z', finishedAt: '2026-11-14T11:00:00.000Z', outcome: 'ok' }));

    expect(repo.findLatest('facturacion')?.id).toBe('r-3');
    expect(repo.findLatestSuccess('facturacion')?.id).toBe('r-2');

    repo.record(makeRun({ id: 'r-4', startedAt: '2026-11-14T12:59:00.000Z', finishedAt: '2026-11-14T13:00:00.000Z', outcome: 'ok' }));

    expect(repo.findLatest('facturacion')?.id).toBe('r-4');
    expect(repo.findLatestSuccess('facturacion')?.id).toBe('r-4');
  });

  it('las consultas quedan aisladas por job_name', () => {
    const repo = create();
    repo.record(makeRun({ id: 'r-1', startedAt: '2026-11-14T09:59:00.000Z', finishedAt: '2026-11-14T10:00:00.000Z', outcome: 'ok' }));
    repo.record(makeRun({ id: 'r-2', jobName: 'recordatorios', startedAt: '2026-11-14T12:59:00.000Z', finishedAt: '2026-11-14T13:00:00.000Z', outcome: 'ok' }));
    repo.record(makeRun({ id: 'r-3', jobName: 'recordatorios', startedAt: '2026-11-14T13:59:00.000Z', finishedAt: '2026-11-14T14:00:00.000Z', outcome: 'error' }));

    expect(repo.findLatest('facturacion')?.id).toBe('r-1');
    expect(repo.findLatestSuccess('facturacion')?.id).toBe('r-1');
    expect(repo.findLatest('recordatorios')?.id).toBe('r-3');
    expect(repo.findLatestSuccess('recordatorios')?.id).toBe('r-2');
    expect(repo.findLatest('otro')).toBeNull();
  });

  it('un proceso que solo tuvo corridas con error: findLatest la devuelve y findLatestSuccess da null', () => {
    const repo = create();
    repo.record(makeRun({ id: 'r-1', startedAt: '2026-11-14T09:59:00.000Z', finishedAt: '2026-11-14T10:00:00.000Z', outcome: 'error' }));
    repo.record(makeRun({ id: 'r-2', startedAt: '2026-11-14T10:59:00.000Z', finishedAt: '2026-11-14T11:00:00.000Z', outcome: 'error' }));

    const latest = repo.findLatest('facturacion');
    expect(latest?.id).toBe('r-2');
    expect(latest?.outcome).toBe('error');
    expect(repo.findLatestSuccess('facturacion')).toBeNull();
  });

  it('con igual finished_at desempata por started_at más reciente y después por id mayor', () => {
    const repo = create();
    const finishedAt = '2026-11-14T12:00:00.000Z';
    // grabadas en un orden que no coincide con el desempate esperado
    repo.record(makeRun({ id: 'r-b', startedAt: '2026-11-14T11:58:00.000Z', finishedAt, outcome: 'ok' }));
    repo.record(makeRun({ id: 'r-c', startedAt: '2026-11-14T11:59:00.000Z', finishedAt, outcome: 'ok' }));
    repo.record(makeRun({ id: 'r-a', startedAt: '2026-11-14T11:59:00.000Z', finishedAt, outcome: 'ok' }));

    expect(repo.findLatestSuccess('facturacion')?.id).toBe('r-c');
    expect(repo.findLatest('facturacion')?.id).toBe('r-c');
  });

  it('el desempate entre una corrida ok y una con error de igual finished_at sigue la misma regla', () => {
    const repo = create();
    const finishedAt = '2026-11-14T12:00:00.000Z';
    repo.record(makeRun({ id: 'r-ok', startedAt: '2026-11-14T11:59:00.000Z', finishedAt, outcome: 'ok' }));
    repo.record(makeRun({ id: 'r-err', startedAt: '2026-11-14T11:58:00.000Z', finishedAt, outcome: 'error' }));

    // started_at más reciente gana
    expect(repo.findLatest('facturacion')?.id).toBe('r-ok');

    repo.record(makeRun({ id: 'r-zz', startedAt: '2026-11-14T11:59:00.000Z', finishedAt, outcome: 'error' }));

    // mismo finished_at y started_at: gana el id mayor ('r-zz' > 'r-ok')
    expect(repo.findLatest('facturacion')?.id).toBe('r-zz');
    expect(repo.findLatestSuccess('facturacion')?.id).toBe('r-ok');
  });
});
