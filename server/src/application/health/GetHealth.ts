import { evaluateHealth, type HealthReport, type JobHealthInput } from '../../domain/health/HealthEvaluation.js';
import type { JobDefinition } from '../../domain/health/JobDefinition.js';
import type { JobRunRepository } from '../../domain/health/JobRunRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { DatabaseProbe } from './DatabaseProbe.js';
import type { HealthEventLog } from './HealthEventLog.js';
import type { JobRegistry } from './JobRegistry.js';

export interface GetHealthDeps {
  probe: DatabaseProbe;
  runs: JobRunRepository;
  registry: JobRegistry;
  clock: Clock;
  /** Lo fija el composition root con `clock.now()` al arrancar. */
  systemStartedAt: Date;
  /** Donde se informa la lectura fallida de las corridas de un proceso (FR-06). */
  log: HealthEventLog;
}

/**
 * Estado de la app (FR-02, FR-03, FR-05). Sondea la base primero; solo si está disponible consulta
 * la última corrida y la última exitosa de cada proceso registrado (NFR-01, R-03). La disponibilidad
 * de la base sale solo del sondeo: si la lectura de las corridas de un proceso falla, ese proceso
 * queda con lectura fallida (degradado), se informa por `log` y los demás se evalúan normalmente.
 * Nunca lanza.
 */
export class GetHealth {
  constructor(private readonly deps: GetHealthDeps) {}

  execute(): HealthReport {
    const { probe, registry, clock, systemStartedAt } = this.deps;
    const definitions = registry.list();
    const dbAvailable = probe.isAvailable();
    const jobs: JobHealthInput[] = dbAvailable
      ? definitions.map((definition) => this.readRuns(definition))
      : definitions.map((definition) => ({ definition, readFailed: false, lastRun: null, lastSuccess: null }));
    return evaluateHealth({ now: clock.now(), systemStartedAt, dbAvailable, jobs });
  }

  /**
   * Última corrida y última exitosa de un proceso. Si la lectura falla (la base se bloqueó entre el
   * sondeo y la consulta, o una fila guardada es ilegible), el proceso queda con lectura fallida y se
   * registra su nombre y el tipo de error — nunca el mensaje, que puede traer el valor guardado
   * (NFR-02, NFR-03). Un fallo del propio log se ignora.
   */
  private readRuns(definition: JobDefinition): JobHealthInput {
    const { runs, log } = this.deps;
    try {
      return {
        definition,
        readFailed: false,
        lastRun: runs.findLatest(definition.name),
        lastSuccess: runs.findLatestSuccess(definition.name),
      };
    } catch (err) {
      const errorType = err instanceof Error ? err.name : typeof err;
      try {
        log.jobReadFailed({ jobName: definition.name, errorType });
      } catch {
        // El puerto promete no lanzar; si igual lo hace, el reporte sale de todos modos.
      }
      return { definition, readFailed: true };
    }
  }
}
