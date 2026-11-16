import { createTransport } from 'nodemailer';
import type { EmailMessage, EmailSender } from '../../application/shared/EmailSender.js';
import type { GmailCredentials } from './emailConfig.js';

/** El mail tal como se le entrega al transporte. */
export interface SmtpMail {
  from: string;
  to: string;
  subject: string;
  text: string;
}

/** La parte del transporte de nodemailer que usa el adaptador; los tests inyectan uno sin red. */
export interface SmtpTransport {
  sendMail(mail: SmtpMail): Promise<unknown>;
}

/** Opciones de transporte SMTP que fija el adaptador (ADR-007). */
export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  logger: boolean;
  debug: boolean;
}

export type SmtpTransportFactory = (options: SmtpTransportOptions) => SmtpTransport;

const SMTP_TIMEOUT_MS = 15_000;

const nodemailerTransport: SmtpTransportFactory = (options) => createTransport(options);

/**
 * `EmailSender` sobre SMTP de Gmail con contraseña de aplicación (FEAT-008, FR-02, ADR-007):
 * smtp.gmail.com:465 con TLS, timeouts de 15 s y el logger y el debug de nodemailer apagados, así
 * ni el mensaje ni las credenciales llegan a la consola (NFR-04). El remitente es `GMAIL_USER`.
 * `send` rechaza con el error del transporte tal cual (su `code`, p. ej. `EAUTH` o `ETIMEDOUT`, es
 * lo que registra el caso de uso); el adaptador no registra nada.
 */
export class SmtpEmailSender implements EmailSender {
  private readonly transport: SmtpTransport;
  private readonly from: string;

  constructor(credentials: GmailCredentials, factory: SmtpTransportFactory = nodemailerTransport) {
    this.from = credentials.user;
    this.transport = factory({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: credentials.user, pass: credentials.pass },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      logger: false,
      debug: false,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
