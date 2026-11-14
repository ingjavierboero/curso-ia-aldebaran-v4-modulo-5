import { and, desc, eq, sql } from 'drizzle-orm';
import { JobRun, mostRecent, type JobOutcome } from '../../domain/health/JobRun.js';
import type { JobRunRepository } from '../../domain/health/JobRunRepository.js';
import type { SqliteHandle } from './handle.js';
import { parseIsoDate } from './parseIsoDate.js';
import { jobRuns } from './schema.js';

type JobRunRow = typeof jobRuns.$inferSelect;

/**
 * `JobRunRepository` síncrono sobre SQLite (ADR-003). Fechas: `Date` en la entidad, ISO 8601 en la tabla.
 *
 * Cada lectura recorre `job_runs_job_outcome_finished_idx` con `job_name` y `outcome` fijos, sin ordenar
 * en un B-tree temporal: trae las corridas empatadas en el mayor `finished_at` y desempata en memoria
 * con `compareRecency` (`started_at` y después `id`). Un ORDER BY sobre esas columnas no cubiertas por
 * el índice obligaría a SQLite a ordenar aparte.
 */
export class DrizzleJobRunRepository implements JobRunRepository {
  constructor(private readonly db: SqliteHandle) {}

  record(run: JobRun): void {
    this.db
      .insert(jobRuns)
      .values({
        id: run.id,
        jobName: run.jobName,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt.toISOString(),
        outcome: run.outcome,
      })
      .run();
  }

  findLatest(jobName: string): JobRun | null {
    const success = this.findLatestWithOutcome(jobName, 'ok');
    const failure = this.findLatestWithOutcome(jobName, 'error');
    return mostRecent([success, failure].filter((run): run is JobRun => run !== null));
  }

  findLatestSuccess(jobName: string): JobRun | null {
    return this.findLatestWithOutcome(jobName, 'ok');
  }

  private findLatestWithOutcome(jobName: string, outcome: JobOutcome): JobRun | null {
    const latestFinishedAt = this.db
      .select({ finishedAt: jobRuns.finishedAt })
      .from(jobRuns)
      .where(and(eq(jobRuns.jobName, jobName), eq(jobRuns.outcome, outcome)))
      .orderBy(desc(jobRuns.finishedAt))
      .limit(1);
    const rows = this.db
      .select()
      .from(jobRuns)
      .where(
        and(
          eq(jobRuns.jobName, jobName),
          eq(jobRuns.outcome, outcome),
          eq(jobRuns.finishedAt, sql`(${latestFinishedAt})`),
        ),
      )
      .all();
    return mostRecent(rows.map(toEntity));
  }
}

function toEntity(row: JobRunRow): JobRun {
  return new JobRun({
    id: row.id,
    jobName: row.jobName,
    startedAt: parseIsoDate(row.startedAt, 'job_runs.started_at'),
    finishedAt: parseIsoDate(row.finishedAt, 'job_runs.finished_at'),
    outcome: row.outcome,
  });
}
