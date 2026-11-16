import type { EmailMessage, EmailSender } from '../../application/shared/EmailSender.js';

/** No hay credenciales de Gmail: el email no se pudo enviar (FEAT-008, ADR-007). */
export class EmailUnconfigured extends Error {
  override readonly name = 'EmailUnconfigured';

  constructor(message = 'El envío de emails no está configurado (faltan GMAIL_USER o GMAIL_APP_PASSWORD)') {
    super(message);
  }
}

/**
 * `EmailSender` que se arma cuando faltan las credenciales de Gmail: el server arranca igual y cada
 * envío rechaza con `EmailUnconfigured`, que el caso de uso registra como `send_failed`.
 */
export class UnconfiguredEmailSender implements EmailSender {
  send(_message: EmailMessage): Promise<void> {
    return Promise.reject(new EmailUnconfigured());
  }
}
