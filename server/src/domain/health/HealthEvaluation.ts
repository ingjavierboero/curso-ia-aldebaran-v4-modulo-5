import type { JobDefinition } from './JobDefinition.js';
import type { JobOutcome, JobRun } from './JobRun.js';

export type HealthStatus = 'ok' | 'degradado';
export type DatabaseStatus = 'disponible' | 'no_disponible';

/** Cantidad de intervalos sin una corrida exitosa a partir de la cual un proceso está atrasado (FR-06). */
export const LATE_AFTER_INTERVALS = 2;

export interface JobHealthInput {
  definition: JobDefinition;
  lastRun: JobRun | null;
  lastSuccess: JobRun | null;
}

export interface HealthInput {
  now: Date;
  systemStartedAt: Date;
  dbAvailable: boolean;
  jobs: JobHealthInput[];
}

export interface JobHealth {
  name: string;
  lastRunAt: Date | null;
  lastOutcome: JobOutcome | null;
  late: boolean;
}

export interface HealthReport {
  status: HealthStatus;
  db: DatabaseStatus;
  jobs: JobHealth[];
}

/**
 * Evaluación pura del estado (FR-03, FR-06). Un proceso está atrasado cuando pasaron más de 2
 * intervalos desde su última corrida exitosa o, si no tuvo ninguna, desde el arranque. El estado es
 * "degradado" si la base no está disponible, si algún proceso está atrasado o si la última corrida de
 * alguno terminó con error. Sin base, los procesos se informan sin datos de corrida y sin atraso.
 */
export function evaluateHealth(input: HealthInput): HealthReport {
  if (!input.dbAvailable) {
    return {
      status: 'degradado',
      db: 'no_disponible',
      jobs: input.jobs.map((job) => ({ name: job.definition.name, lastRunAt: null, lastOutcome: null, late: false })),
    };
  }

  const jobs = input.jobs.map((job) => evaluateJob(job, input.now, input.systemStartedAt));
  const degraded = jobs.some((job) => job.late || job.lastOutcome === 'error');
  return { status: degraded ? 'degradado' : 'ok', db: 'disponible', jobs };
}

function evaluateJob(job: JobHealthInput, now: Date, systemStartedAt: Date): JobHealth {
  const since = job.lastSuccess?.finishedAt ?? systemStartedAt;
  const late = now.getTime() - since.getTime() > LATE_AFTER_INTERVALS * job.definition.intervalMs;
  return {
    name: job.definition.name,
    lastRunAt: job.lastRun ? new Date(job.lastRun.finishedAt.getTime()) : null,
    lastOutcome: job.lastRun?.outcome ?? null,
    late,
  };
}
