import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobRun, type JobOutcome } from '../../../src/domain/health/JobRun.js';
import { DrizzleJobRunRepository } from '../../../src/infrastructure/db/DrizzleJobRunRepository.js';
import { createTestDb, type TestDb } from '../../support/sqliteTestDb.js';

function makeRun(id: string, jobName: string, finishedAt: string, outcome: JobOutcome): JobRun {
  const finished = new Date(finishedAt);
  return new JobRun({
    id,
    jobName,
    startedAt: new Date(finished.getTime() - 1500),
    finishedAt: finished,
    outcome,
  });
}

describe('DrizzleJobRunRepository', () => {
  let t: TestDb;

  beforeEach(() => {
    t = createTestDb();
  });

  afterEach(() => {
    t.cleanup();
  });

  // AC-09: guarda inicio, fin y resultado; devuelve la última corrida y la última exitosa
  it('test_repositorio_guarda_y_devuelve_ultima_corrida', () => {
    const repo = new DrizzleJobRunRepository(t.db);

    expect(repo.findLatest('facturacion')).toBeNull();
    expect(repo.findLatestSuccess('facturacion')).toBeNull();

    repo.record(makeRun('r-1', 'facturacion', '2026-11-14T10:00:00.000Z', 'ok'));
    repo.record(makeRun('r-3', 'facturacion', '2026-11-14T12:00:00.000Z', 'error'));
    repo.record(makeRun('r-2', 'facturacion', '2026-11-14T11:00:00.000Z', 'ok'));
    repo.record(makeRun('r-4', 'recordatorios', '2026-11-14T13:00:00.000Z', 'ok'));

    const latest = repo.findLatest('facturacion');
    expect(latest).toBeInstanceOf(JobRun);
    expect(latest?.id).toBe('r-3');
    expect(latest?.jobName).toBe('facturacion');
    expect(latest?.outcome).toBe('error');
    expect(latest?.startedAt.toISOString()).toBe('2026-11-14T11:59:58.500Z');
    expect(latest?.finishedAt.toISOString()).toBe('2026-11-14T12:00:00.000Z');

    const success = repo.findLatestSuccess('facturacion');
    expect(success?.id).toBe('r-2');
    expect(success?.outcome).toBe('ok');
    expect(success?.finishedAt.toISOString()).toBe('2026-11-14T11:00:00.000Z');

    expect(repo.findLatest('otro')).toBeNull();

    const row = t.db.$client
      .prepare('SELECT job_name, started_at, finished_at, outcome FROM job_runs WHERE id = ?')
      .get('r-1');
    expect(row).toEqual({
      job_name: 'facturacion',
      started_at: '2026-11-14T09:59:58.500Z',
      finished_at: '2026-11-14T10:00:00.000Z',
      outcome: 'ok',
    });
  });

  // las consultas de lectura usan job_runs_job_outcome_finished_idx y no ordenan en un B-tree temporal
  it('findLatest y findLatestSuccess se resuelven con el índice, sin TEMP B-TREE', () => {
    const repo = new DrizzleJobRunRepository(t.db);
    repo.record(makeRun('r-1', 'facturacion', '2026-11-14T10:00:00.000Z', 'ok'));
    const client = t.db.$client;
    const prepared: string[] = [];
    const original = client.prepare.bind(client);
    const spy = vi.spyOn(client, 'prepare').mockImplementation((source: string) => {
      prepared.push(source);
      return original(source);
    });

    try {
      repo.findLatest('facturacion');
      repo.findLatestSuccess('facturacion');
    } finally {
      spy.mockRestore();
    }

    const selects = prepared.filter((s) => /^\s*select/i.test(s));
    expect(selects.length).toBeGreaterThan(0);
    for (const source of selects) {
      // EXPLAIN QUERY PLAN no ejecuta la consulta: alcanza con ligar cada parámetro
      const params = (source.match(/\?/g) ?? []).map(() => null);
      const plan = (client.prepare(`EXPLAIN QUERY PLAN ${source}`).all(...params) as { detail: string }[])
        .map((r) => r.detail)
        .join('\n');
      expect(plan).toContain('job_runs_job_outcome_finished_idx');
      expect(plan).not.toMatch(/TEMP B-TREE/);
      expect(plan).not.toMatch(/^SCAN job_runs$/m);
    }
  });

  it('findLatest lanza si finished_at no es un ISO 8601 válido (no hidrata Invalid Date)', () => {
    const repo = new DrizzleJobRunRepository(t.db);
    repo.record(makeRun('r-1', 'facturacion', '2026-11-14T10:00:00.000Z', 'ok'));
    t.db.$client.prepare("UPDATE job_runs SET finished_at = 'zzz-no-es-fecha' WHERE id = 'r-1'").run();

    expect(() => repo.findLatest('facturacion')).toThrow(/job_runs\.finished_at/);
  });
});
