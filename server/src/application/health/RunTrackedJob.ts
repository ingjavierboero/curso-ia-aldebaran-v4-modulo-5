import { JobRun, type JobOutcome } from '../../domain/health/JobRun.js';
import type { JobRunRepository } from '../../domain/health/JobRunRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import { JobRunNotRecorded, UnknownJob } from './errors.js';
import type { JobRegistry } from './JobRegistry.js';

export interface RunTrackedJobDeps {
  registry: JobRegistry;
  runs: JobRunRepository;
  ids: IdGenerator;
  clock: Clock;
}

/**
 * Ejecuta un proceso registrado y graba su corrida (FR-05): inicio, fin y resultado, en una sola
 * escritura al terminar. Nunca guarda el mensaje de error (R-07). Un nombre no registrado lanza
 * `UnknownJob` sin correr nada. El error del job se relanza tal cual; un fallo al grabar no lo
 * reemplaza. Si el job terminó bien y falla la grabación, se rechaza con `JobRunNotRecorded`
 * (causa: el error de grabación). La grabación es síncrona y ocurre después
 * del `await`, fuera de cualquier transacción (ADR-003).
 */
export class RunTrackedJob {
  constructor(private readonly deps: RunTrackedJobDeps) {}

  async run<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    const { registry, clock } = this.deps;
    const definition = registry.find(name);
    if (!definition) throw new UnknownJob(name);

    const startedAt = clock.now();
    let result: T;
    try {
      result = await fn();
    } catch (jobError) {
      try {
        this.record(definition.name, startedAt, 'error');
      } catch {
        // la grabación falló: el error que importa es el del job
      }
      throw jobError;
    }
    try {
      this.record(definition.name, startedAt, 'ok');
    } catch (recordError) {
      throw new JobRunNotRecorded(definition.name, recordError);
    }
    return result;
  }

  private record(jobName: string, startedAt: Date, outcome: JobOutcome): void {
    const { runs, ids, clock } = this.deps;
    runs.record(new JobRun({ id: ids.next(), jobName, startedAt, finishedAt: clock.now(), outcome }));
  }
}
