import { describe, expect, it } from 'vitest';
import { createEmailSender } from '../../../src/infrastructure/email/createEmailSender.js';
import { InvalidConfig } from '../../../src/infrastructure/email/emailConfig.js';
import type { SmtpMail, SmtpTransportFactory, SmtpTransportOptions } from '../../../src/infrastructure/email/SmtpEmailSender.js';
import type { Logger, LogRecord } from '../../../src/infrastructure/http/authLog.js';
import { FakeClock } from '../../support/FakeClock.js';

const AT = '2026-11-16T14:00:00.000Z';
const MESSAGE = { to: 'ana@empresa.com', subject: 'Asunto', text: 'Cuerpo' };

function setup() {
  const records: LogRecord[] = [];
  const logger: Logger = {
    info: (record) => records.push({ level: 'info', ...record }),
    error: (record) => records.push({ level: 'error', ...record }),
  };
  const options: SmtpTransportOptions[] = [];
  const mails: SmtpMail[] = [];
  const transportFactory: SmtpTransportFactory = (opts) => {
    options.push(opts);
    return {
      sendMail: (mail) => {
        mails.push(mail);
        return Promise.resolve({});
      },
    };
  };
  return { records, logger, options, mails, transportFactory, clock: new FakeClock(AT) };
}

describe('createEmailSender', () => {
  it('sin credenciales arma el sender sin configurar y registra email_unconfigured', async () => {
    const { records, logger, options, transportFactory, clock } = setup();

    const sender = createEmailSender({ env: { GMAIL_USER: 'sistema@gmail.com' }, logger, clock, transportFactory });

    await expect(sender.send(MESSAGE)).rejects.toMatchObject({ name: 'EmailUnconfigured' });
    expect(options).toEqual([]);
    expect(records).toEqual([{ level: 'info', event: 'email_unconfigured', at: AT }]);
  });

  it('con las dos credenciales envía por SMTP y no registra nada', async () => {
    const { records, logger, mails, transportFactory, clock } = setup();
    const env = { GMAIL_USER: 'sistema@gmail.com', GMAIL_APP_PASSWORD: 'clave-de-aplicacion' };

    const sender = createEmailSender({ env, logger, clock, transportFactory });
    await sender.send(MESSAGE);

    expect(mails).toEqual([{ from: 'sistema@gmail.com', ...MESSAGE }]);
    expect(records).toEqual([]);
  });

  it('con EMAIL_REDIRECT_TO redirige y registra email_redirect_active sin la dirección ni credenciales', async () => {
    const { records, logger, mails, transportFactory, clock } = setup();
    const env = {
      GMAIL_USER: 'sistema@gmail.com',
      GMAIL_APP_PASSWORD: 'clave-de-aplicacion',
      EMAIL_REDIRECT_TO: 'dev@empresa.com',
    };

    const sender = createEmailSender({ env, logger, clock, transportFactory });
    await sender.send(MESSAGE);

    expect(mails.map((m) => m.to)).toEqual(['dev@empresa.com']);
    expect(records).toEqual([{ level: 'info', event: 'email_redirect_active', at: AT }]);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain('dev@empresa.com');
    expect(serialized).not.toContain('sistema@gmail.com');
    expect(serialized).not.toContain('clave-de-aplicacion');
  });

  it('sin credenciales y con redirección registra los dos avisos; nunca las credenciales', () => {
    const { records, logger, transportFactory, clock } = setup();
    const env = { GMAIL_APP_PASSWORD: 'clave-de-aplicacion', EMAIL_REDIRECT_TO: 'dev@empresa.com' };

    createEmailSender({ env, logger, clock, transportFactory });

    expect(records.map((r) => r.event)).toEqual(['email_unconfigured', 'email_redirect_active']);
    expect(JSON.stringify(records)).not.toContain('clave-de-aplicacion');
  });

  it('EMAIL_REDIRECT_TO inválido lanza InvalidConfig', () => {
    const { logger, transportFactory, clock } = setup();

    expect(() => createEmailSender({ env: { EMAIL_REDIRECT_TO: 'no-es-email' }, logger, clock, transportFactory })).toThrow(
      InvalidConfig,
    );
  });
});
