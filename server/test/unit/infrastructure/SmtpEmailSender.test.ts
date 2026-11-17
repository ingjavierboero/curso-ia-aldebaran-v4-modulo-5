import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SmtpEmailSender,
  type SmtpMail,
  type SmtpTransport,
  type SmtpTransportOptions,
} from '../../../src/infrastructure/email/SmtpEmailSender.js';

const CREDENTIALS = { user: 'sistema@gmail.com', pass: 'clave-de-aplicacion' };
const MESSAGE = { to: 'ana@empresa.com', subject: 'Recuperación', text: 'https://x/recuperar/TOKEN-SECRETO' };

/** Transporte inyectado: registra las opciones y los mails; no abre ninguna conexión. */
function recordingFactory(sendMail: (mail: SmtpMail) => Promise<unknown>) {
  const options: SmtpTransportOptions[] = [];
  const mails: SmtpMail[] = [];
  const factory = (opts: SmtpTransportOptions): SmtpTransport => {
    options.push(opts);
    return {
      sendMail: (mail) => {
        mails.push(mail);
        return sendMail(mail);
      },
    };
  };
  return { factory, options, mails };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SmtpEmailSender', () => {
  it('test_smtp_opciones_de_transporte', async () => {
    const { factory, options, mails } = recordingFactory(() => Promise.resolve({ messageId: '<1@x>' }));

    const sender = new SmtpEmailSender(CREDENTIALS, factory);
    await sender.send(MESSAGE);

    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'sistema@gmail.com', pass: 'clave-de-aplicacion' },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 15_000,
      logger: false,
      debug: false,
    });
    expect(mails).toEqual([
      { from: 'sistema@gmail.com', to: 'ana@empresa.com', subject: 'Recuperación', text: MESSAGE.text },
    ]);
  });

  // sad path: SMTP rechaza o no responde (timeout) y el adaptador no registra nada del mensaje.
  // Que nodemailer no escriba por su cuenta lo garantizan `logger: false` y `debug: false`, que
  // afirma test_smtp_opciones_de_transporte; acá se captura lo que llegue a la consola.
  it('test_smtp_error_rechaza_sin_registrar_mensaje', async () => {
    const written: string[] = [];
    const capture = (...args: unknown[]): void => {
      written.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation(capture);
    }

    const authError = Object.assign(new Error('Invalid login: 535-5.7.8'), { code: 'EAUTH' });
    const timeoutError = Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' });

    const failing = recordingFactory(() => Promise.reject(authError));
    await expect(new SmtpEmailSender(CREDENTIALS, failing.factory).send(MESSAGE)).rejects.toMatchObject({
      code: 'EAUTH',
    });

    const timingOut = recordingFactory(() => Promise.reject(timeoutError));
    await expect(new SmtpEmailSender(CREDENTIALS, timingOut.factory).send(MESSAGE)).rejects.toMatchObject({
      code: 'ETIMEDOUT',
    });

    vi.restoreAllMocks();
    const all = written.join('\n');
    expect(all).not.toContain('TOKEN-SECRETO');
    expect(all).not.toContain('clave-de-aplicacion');
  });
});
