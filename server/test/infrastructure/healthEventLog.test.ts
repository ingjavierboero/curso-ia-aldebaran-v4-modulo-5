import { describe, expect, it } from 'vitest';
import type { Logger, LogRecord } from '../../src/infrastructure/http/authLog.js';
import { createHealthEventLog } from '../../src/infrastructure/logging/healthEventLog.js';
import { FakeClock } from '../support/FakeClock.js';

describe('createHealthEventLog', () => {
  // AC-08 / AC-11 / NFR-03: nombre del proceso, tipo de error y fecha; nada de la sesión ni del usuario
  it('test_health_event_log_registro_sin_datos_de_sesion', () => {
    const clock = new FakeClock('2026-11-14T15:30:00.000Z');
    const errors: LogRecord[] = [];
    const infos: LogRecord[] = [];
    const logger: Logger = {
      info: (record) => infos.push(record),
      error: (record) => errors.push(record),
    };

    createHealthEventLog(logger, clock).jobReadFailed({ jobName: 'facturacion', errorType: 'InvalidStoredDate' });

    expect(infos).toEqual([]);
    expect(errors).toEqual([
      {
        event: 'health_job_read_failed',
        job: 'facturacion',
        errorType: 'InvalidStoredDate',
        at: '2026-11-14T15:30:00.000Z',
      },
    ]);
    expect(Object.keys(errors[0] as object).sort()).toEqual(['at', 'errorType', 'event', 'job']);
  });

  // Contrato del puerto: si el logger no puede escribir, el evento se descarta sin lanzar
  it('test_health_event_log_error_de_escritura_no_lanza', () => {
    let attempts = 0;
    const logger: Logger = {
      info: () => {
        throw new Error('EPIPE');
      },
      error: () => {
        attempts += 1;
        throw new Error('EPIPE');
      },
    };
    const log = createHealthEventLog(logger, new FakeClock());

    expect(() => {
      log.jobReadFailed({ jobName: 'facturacion', errorType: 'Error' });
    }).not.toThrow();
    expect(attempts).toBe(1);
  });
});
