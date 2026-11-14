import { mostRecent, type JobRun } from '../../src/domain/health/JobRun.js';
import type { JobRunRepository } from '../../src/domain/health/JobRunRepository.js';

export class InMemoryJobRunRepository implements JobRunRepository {
  private readonly rows: JobRun[] = [];

  record(run: JobRun): void {
    if (this.rows.some((r) => r.id === run.id)) throw new Error(`UNIQUE job_runs.id: ${run.id}`);
    this.rows.push(run);
  }

  findLatest(jobName: string): JobRun | null {
    return mostRecent(this.rows.filter((r) => r.jobName === jobName));
  }

  findLatestSuccess(jobName: string): JobRun | null {
    return mostRecent(this.rows.filter((r) => r.jobName === jobName && r.outcome === 'ok'));
  }

  all(): JobRun[] {
    return [...this.rows];
  }
}
