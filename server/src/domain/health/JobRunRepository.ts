import type { JobRun } from './JobRun.js';

/** Puerto síncrono (ADR-003). */
export interface JobRunRepository {
  record(run: JobRun): void;
  findLatest(jobName: string): JobRun | null;
  findLatestSuccess(jobName: string): JobRun | null;
}
