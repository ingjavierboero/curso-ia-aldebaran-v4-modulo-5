import { describe, expect, it } from 'vitest';
import { evaluateHealth, type JobHealthInput } from '../../../src/domain/health/HealthEvaluation.js';
import { JobDefinition } from '../../../src/domain/health/JobDefinition.js';
import { JobRun, type JobOutcome } from '../../../src/domain/health/JobRun.js';

const MINUTE = 60_000;
const STARTED = new Date('2026-11-14T10:00:00.000Z');

function at(msFromStart: number): Date {
  return new Date(STARTED.getTime() + msFromStart);
}

function run(id: string, finishedMs: number, outcome: JobOutcome): JobRun {
  return new JobRun({ id, jobName: 'facturacion', startedAt: at(finishedMs - 1000), finishedAt: at(finishedMs), outcome });
}

const def = new JobDefinition({ name: 'facturacion', intervalMs: 10 * MINUTE });

function job(lastRun: JobRun | null, lastSuccess: JobRun | null): JobHealthInput {
  return { definition: def, readFailed: false, lastRun, lastSuccess };
}

describe('evaluateHealth', () => {
  // AC-10: más de 2 intervalos desde la última corrida exitosa → atrasado; exactamente 2, no
  it('test_job_atrasado_tras_dos_intervalos_sin_exito', () => {
    const success = run('r-1', 5 * MINUTE, 'ok');
    const base = { systemStartedAt: STARTED, dbAvailable: true, jobs: [job(success, success)] };

    const justAtLimit = evaluateHealth({ ...base, now: at(5 * MINUTE + 20 * MINUTE) });
    expect(justAtLimit.jobs[0]?.late).toBe(false);
    expect(justAtLimit.status).toBe('ok');

    const late = evaluateHealth({ ...base, now: at(5 * MINUTE + 20 * MINUTE + 1) });
    expect(late.jobs[0]?.late).toBe(true);
    expect(late.status).toBe('degradado');
  });

  // AC-11: sin corridas exitosas, los intervalos se cuentan desde el arranque del sistema
  it('test_job_sin_corridas_cuenta_desde_el_arranque', () => {
    const base = { systemStartedAt: STARTED, dbAvailable: true, jobs: [job(null, null)] };

    const recent = evaluateHealth({ ...base, now: at(20 * MINUTE) });
    expect(recent.jobs[0]).toEqual({ name: 'facturacion', lastRunAt: null, lastOutcome: null, late: false, readFailed: false });
    expect(recent.status).toBe('ok');

    const late = evaluateHealth({ ...base, now: at(20 * MINUTE + 1) });
    expect(late.jobs[0]?.late).toBe(true);
    expect(late.status).toBe('degradado');
  });

  // AC-06: la última corrida con error degrada aunque el proceso no esté atrasado
  it('test_ultima_corrida_con_error_degrada', () => {
    const success = run('r-1', 5 * MINUTE, 'ok');
    const failure = run('r-2', 6 * MINUTE, 'error');

    const result = evaluateHealth({
      now: at(7 * MINUTE),
      systemStartedAt: STARTED,
      dbAvailable: true,
      jobs: [job(failure, success)],
    });

    expect(result.status).toBe('degradado');
    expect(result.jobs[0]).toEqual({
      name: 'facturacion',
      lastRunAt: at(6 * MINUTE),
      lastOutcome: 'error',
      late: false,
      readFailed: false,
    });
  });

  // AC-05: base no disponible → degradado, base no_disponible, jobs sin datos de corrida ni atraso
  it('test_base_no_disponible_degrada_y_omite_corridas', () => {
    const failure = run('r-2', 6 * MINUTE, 'error');

    const result = evaluateHealth({
      now: at(500 * MINUTE),
      systemStartedAt: STARTED,
      dbAvailable: false,
      jobs: [job(failure, null)],
    });

    expect(result).toEqual({
      status: 'degradado',
      db: 'no_disponible',
      jobs: [{ name: 'facturacion', lastRunAt: null, lastOutcome: null, late: false, readFailed: false }],
    });
  });

  // AC-01: base disponible, sin atrasos ni errores → ok
  it('test_todo_sano_estado_ok', () => {
    const success = run('r-1', 5 * MINUTE, 'ok');
    const other = new JobDefinition({ name: 'recordatorios', intervalMs: 5 * MINUTE });

    expect(evaluateHealth({ now: at(MINUTE), systemStartedAt: STARTED, dbAvailable: true, jobs: [] })).toEqual({
      status: 'ok',
      db: 'disponible',
      jobs: [],
    });

    const result = evaluateHealth({
      now: at(6 * MINUTE),
      systemStartedAt: STARTED,
      dbAvailable: true,
      jobs: [job(success, success), { definition: other, readFailed: false, lastRun: null, lastSuccess: null }],
    });
    expect(result.status).toBe('ok');
    expect(result.db).toBe('disponible');
    expect(result.jobs).toEqual([
      { name: 'facturacion', lastRunAt: at(5 * MINUTE), lastOutcome: 'ok', late: false, readFailed: false },
      { name: 'recordatorios', lastRunAt: null, lastOutcome: null, late: false, readFailed: false },
    ]);
  });

  // AC-06: la lectura fallida de las corridas de un proceso lo degrada aunque la base esté disponible
  it('test_evaluacion_lectura_fallida_degrada_el_proceso', () => {
    const success = run('r-1', 5 * MINUTE, 'ok');
    const other = new JobDefinition({ name: 'recordatorios', intervalMs: 10 * MINUTE });

    const result = evaluateHealth({
      now: at(6 * MINUTE),
      systemStartedAt: STARTED,
      dbAvailable: true,
      jobs: [job(success, success), { definition: other, readFailed: true }],
    });

    expect(result.status).toBe('degradado');
    expect(result.db).toBe('disponible');
    expect(result.jobs[0]).toEqual({
      name: 'facturacion',
      lastRunAt: at(5 * MINUTE),
      lastOutcome: 'ok',
      late: false,
      readFailed: false,
    });
    expect(result.jobs[1]?.readFailed).toBe(true);
  });

  // AC-06: un proceso con lectura fallida no informa corrida ni atraso, aunque hayan pasado intervalos
  it('test_evaluacion_lectura_fallida_sin_corrida_ni_atraso', () => {
    const result = evaluateHealth({
      now: at(500 * MINUTE),
      systemStartedAt: STARTED,
      dbAvailable: true,
      jobs: [{ definition: def, readFailed: true }],
    });

    expect(result).toEqual({
      status: 'degradado',
      db: 'disponible',
      jobs: [{ name: 'facturacion', lastRunAt: null, lastOutcome: null, late: false, readFailed: true }],
    });
  });
});
