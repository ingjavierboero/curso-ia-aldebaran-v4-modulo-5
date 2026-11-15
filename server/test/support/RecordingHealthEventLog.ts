import type { HealthEventLog, JobReadFailedEvent } from '../../src/application/health/HealthEventLog.js';

/** Guarda los eventos recibidos para que el test los inspeccione. */
export class RecordingHealthEventLog implements HealthEventLog {
  readonly readFailures: JobReadFailedEvent[] = [];

  jobReadFailed(event: JobReadFailedEvent): void {
    this.readFailures.push(event);
  }
}
