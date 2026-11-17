import { describe, expect, it } from 'vitest';
import type { Logger, LogRecord } from '../../../src/infrastructure/http/authLog.js';
import { createPasswordResetLog } from '../../../src/infrastructure/logging/passwordResetLog.js';
import { FakeClock } from '../../support/FakeClock.js';

describe('createPasswordResetLog', () => {
  // AC-16: resultado, email y errorCode; nunca el token, la URL ni el texto del email
  it('test_password_reset_log_sin_token', () => {
    const clock = new FakeClock('2026-11-16T14:00:00.000Z');
    const records: LogRecord[] = [];
    const logger: Logger = {
      info: (record) => records.push({ level: 'info', ...record }),
      error: (record) => records.push({ level: 'error', ...record }),
    };
    const log = createPasswordResetLog(logger, clock);

    log.delivered({ userId: 'u-1', email: 'ana@empresa.com' });
    log.deliveryFailed({ userId: 'u-1', email: 'ana@empresa.com', errorCode: 'EAUTH' });

    expect(records).toEqual([
      {
        level: 'info',
        event: 'password_reset_request',
        outcome: 'sent',
        email: 'ana@empresa.com',
        at: '2026-11-16T14:00:00.000Z',
      },
      {
        level: 'error',
        event: 'password_reset_request',
        outcome: 'send_failed',
        email: 'ana@empresa.com',
        errorCode: 'EAUTH',
        at: '2026-11-16T14:00:00.000Z',
      },
    ]);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toMatch(/token|recuperar|https?:/i);

    // Contrato del puerto: nunca lanza aunque el logger falle
    const broken: Logger = {
      info: () => {
        throw new Error('EPIPE');
      },
      error: () => {
        throw new Error('EPIPE');
      },
    };
    const brokenLog = createPasswordResetLog(broken, clock);
    expect(() => {
      brokenLog.delivered({ userId: 'u-1', email: 'ana@empresa.com' });
      brokenLog.deliveryFailed({ userId: 'u-1', email: 'ana@empresa.com', errorCode: 'EAUTH' });
    }).not.toThrow();
  });
});
