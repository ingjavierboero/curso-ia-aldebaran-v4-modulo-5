import type { HealthEventLog } from '../../application/health/HealthEventLog.js';
import type { Clock } from '../../domain/shared/Clock.js';
// `Logger` vive en `http/authLog.ts`; moverlo a `logging/` queda como deuda (spec FEAT-004, Block 2).
import type { Logger } from '../http/authLog.js';

/**
 * Adaptador de `HealthEventLog` sobre el logger estructurado (FR-06). Registra
 * `{ event: 'health_job_read_failed', job, errorType, at }` y nada más: ni el texto del error ni
 * datos de la sesión o del usuario (NFR-02, NFR-03). Nunca lanza: si el logger falla, el evento se
 * descarta.
 */
export function createHealthEventLog(logger: Logger, clock: Clock): HealthEventLog {
  return {
    jobReadFailed: ({ jobName, errorType }) => {
      try {
        logger.error({ event: 'health_job_read_failed', job: jobName, errorType, at: clock.now().toISOString() });
      } catch {
        // Contrato del puerto: no hay a dónde informar que no se pudo informar.
      }
    },
  };
}
