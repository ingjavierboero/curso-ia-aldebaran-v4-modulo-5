import { evaluateHealth, type HealthReport, type JobHealthInput } from '../../domain/health/HealthEvaluation.js';
import type { JobDefinition } from '../../domain/health/JobDefinition.js';
import type { JobRunRepository } from '../../domain/health/JobRunRepository.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { DatabaseProbe } from './DatabaseProbe.js';
import type { JobRegistry } from './JobRegistry.js';

export interface GetHealthDeps {
  probe: DatabaseProbe;
  runs: JobRunRepository;
  registry: JobRegistry;
  clock: Clock;
  /** Lo fija el composition root con `clock.now()` al arrancar. */
  systemStartedAt: Date;
}

/**
 * Estado de la app (FR-02, FR-03). Sondea la base primero; solo si está disponible consulta la
 * última corrida y la última exitosa de cada proceso registrado (NFR-01, R-03). Si esa lectura
 * falla, la base se informa como no disponible.
 */
export class GetHealth {
  constructor(private readonly deps: GetHealthDeps) {}

  execute(): HealthReport {
    const { probe, registry, clock, systemStartedAt } = this.deps;
    const definitions = registry.list();
    let jobs: JobHealthInput[] | null = probe.isAvailable() ? this.readRuns(definitions) : null;
    const dbAvailable = jobs !== null;
    jobs ??= definitions.map((definition) => ({ definition, lastRun: null, lastSuccess: null }));
    return evaluateHealth({ now: clock.now(), systemStartedAt, dbAvailable, jobs });
  }

  /**
   * Última corrida y última exitosa de cada proceso, o null si la lectura falló (la base se cayó o
   * se bloqueó entre el sondeo y la consulta): se informa como no disponible, sin lanzar.
   */
  private readRuns(definitions: readonly JobDefinition[]): JobHealthInput[] | null {
    const { runs } = this.deps;
    try {
      return definitions.map((definition) => ({
        definition,
        lastRun: runs.findLatest(definition.name),
        lastSuccess: runs.findLatestSuccess(definition.name),
      }));
    } catch {
      return null;
    }
  }
}
