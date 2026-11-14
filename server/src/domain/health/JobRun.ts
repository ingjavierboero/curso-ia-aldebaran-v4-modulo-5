export type JobOutcome = 'ok' | 'error';

export interface JobRunProps {
  id: string;
  jobName: string;
  startedAt: Date;
  finishedAt: Date;
  outcome: JobOutcome;
}

/**
 * Orden de "más reciente" entre corridas: `finishedAt` mayor, después `startedAt` mayor, después `id`
 * mayor. Devuelve un número positivo si `a` es más reciente que `b`. Hace determinista la elección de
 * la última corrida cuando dos terminan en el mismo instante.
 */
export function compareRecency(a: JobRun, b: JobRun): number {
  const byFinished = a.finishedAt.getTime() - b.finishedAt.getTime();
  if (byFinished !== 0) return byFinished;
  const byStarted = a.startedAt.getTime() - b.startedAt.getTime();
  if (byStarted !== 0) return byStarted;
  if (a.id === b.id) return 0;
  return a.id > b.id ? 1 : -1;
}

/** La más reciente según `compareRecency`, o null si no hay ninguna. */
export function mostRecent(runs: readonly JobRun[]): JobRun | null {
  let best: JobRun | null = null;
  for (const run of runs) {
    if (!best || compareRecency(run, best) > 0) best = run;
  }
  return best;
}

/** Una corrida terminada de un proceso (FR-05). No guarda el mensaje de error (R-07). */
export class JobRun {
  readonly id: string;
  readonly jobName: string;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly outcome: JobOutcome;

  constructor(props: JobRunProps) {
    this.id = props.id;
    this.jobName = props.jobName;
    // Copias defensivas: la entidad no comparte la Date con quien la creó.
    this.startedAt = new Date(props.startedAt.getTime());
    this.finishedAt = new Date(props.finishedAt.getTime());
    this.outcome = props.outcome;
  }
}
