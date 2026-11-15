import type { JobDefinition } from './JobDefinition.js';
import type { JobOutcome, JobRun } from './JobRun.js';

export type HealthStatus = 'ok' | 'degradado';
export type DatabaseStatus = 'disponible' | 'no_disponible';

/** Cantidad de intervalos sin una corrida exitosa a partir de la cual un proceso está atrasado (FR-06). */
export const LATE_AFTER_INTERVALS = 2;

/**
 * Lo leído de un proceso: sus corridas, o que la lectura de sus corridas falló (FR-05). Con
 * `readFailed: true` no hay corridas que evaluar.
 */
export type JobHealthInput =
  | { definition: JobDefinition; readFailed: true }
  | { definition: JobDefinition; readFailed: false; lastRun: JobRun | null; lastSuccess: JobRun | null };

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
  /** La lectura de las corridas del proceso falló: sin corrida ni atraso, y degrada el estado. */
  readFailed: boolean;
}

export interface HealthReport {
  status: HealthStatus;
  db: DatabaseStatus;
  jobs: JobHealth[];
}

/**
 * Evaluación pura del estado (FR-03, FR-06). Un proceso está atrasado cuando pasaron más de 2
 * intervalos desde su última corrida exitosa o, si no tuvo ninguna, desde el arranque. El estado es
 * "degradado" si la base no está disponible, si algún proceso está atrasado, si la última corrida de
 * alguno terminó con error o si falló la lectura de las corridas de alguno (FR-05). Sin base, los
 * procesos se informan sin datos de corrida, sin atraso y sin lectura fallida. Un proceso con lectura
 * fallida se informa sin datos de corrida y sin atraso.
 */
export function evaluateHealth(input: HealthInput): HealthReport {
  if (!input.dbAvailable) {
    return {
      status: 'degradado',
      db: 'no_disponible',
      jobs: input.jobs.map((job) => ({
        name: job.definition.name,
        lastRunAt: null,
        lastOutcome: null,
        late: false,
        readFailed: false,
      })),
    };
  }

  const jobs = input.jobs.map((job) => evaluateJob(job, input.now, input.systemStartedAt));
  const degraded = jobs.some((job) => job.late || job.lastOutcome === 'error' || job.readFailed);
  return { status: degraded ? 'degradado' : 'ok', db: 'disponible', jobs };
}

function evaluateJob(job: JobHealthInput, now: Date, systemStartedAt: Date): JobHealth {
  if (job.readFailed) {
    return { name: job.definition.name, lastRunAt: null, lastOutcome: null, late: false, readFailed: true };
  }
  const since = job.lastSuccess?.finishedAt ?? systemStartedAt;
  const late = now.getTime() - since.getTime() > LATE_AFTER_INTERVALS * job.definition.intervalMs;
  return {
    name: job.definition.name,
    lastRunAt: job.lastRun ? new Date(job.lastRun.finishedAt.getTime()) : null,
    lastOutcome: job.lastRun?.outcome ?? null,
    late,
    readFailed: false,
  };
}
