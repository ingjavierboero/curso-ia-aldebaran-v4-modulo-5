import type { EmailSender } from '../../application/shared/EmailSender.js';
import type { Clock } from '../../domain/shared/Clock.js';
// `Logger` vive en `http/authLog.ts`; moverlo a `logging/` queda como deuda (spec FEAT-004, Block 2).
import type { Logger } from '../http/authLog.js';
import { resolveEmailRedirect, resolveGmailCredentials } from './emailConfig.js';
import { RedirectingEmailSender } from './RedirectingEmailSender.js';
import { SmtpEmailSender, type SmtpTransportFactory } from './SmtpEmailSender.js';
import { UnconfiguredEmailSender } from './UnconfiguredEmailSender.js';

export interface CreateEmailSenderDeps {
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  clock: Clock;
  /** Transporte SMTP; por defecto, el de nodemailer. Los tests inyectan uno sin red. */
  transportFactory?: SmtpTransportFactory;
}

/**
 * Arma el envío de emails a partir del entorno (FEAT-008, ADR-007): SMTP de Gmail si están las dos
 * credenciales, si no un sender que rechaza cada envío (log `email_unconfigured`), siempre detrás de
 * la redirección de desarrollo (log `email_redirect_active` cuando hay una, sin la dirección).
 * Un `EMAIL_REDIRECT_TO` inválido lanza `InvalidConfig`. Nunca registra las credenciales.
 */
export function createEmailSender({ env = process.env, logger, clock, transportFactory }: CreateEmailSenderDeps): EmailSender {
  const redirectTo = resolveEmailRedirect(env);
  const credentials = resolveGmailCredentials(env);
  let base: EmailSender;
  if (credentials) {
    base = transportFactory ? new SmtpEmailSender(credentials, transportFactory) : new SmtpEmailSender(credentials);
  } else {
    base = new UnconfiguredEmailSender();
    logger.info({ event: 'email_unconfigured', at: clock.now().toISOString() });
  }
  if (redirectTo !== null) {
    logger.info({ event: 'email_redirect_active', at: clock.now().toISOString() });
  }
  return new RedirectingEmailSender(base, redirectTo);
}
