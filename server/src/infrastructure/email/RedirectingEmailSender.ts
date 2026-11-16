import type { EmailMessage, EmailSender } from '../../application/shared/EmailSender.js';

/**
 * Decorador de desarrollo (FEAT-008, FR-17, ADR-007): con una dirección de redirección
 * (`EMAIL_REDIRECT_TO`, ya validada) reemplaza el destinatario de cada email por esa dirección; sin
 * ella (`null`) entrega el mensaje sin cambios. Asunto y texto no se tocan.
 */
export class RedirectingEmailSender implements EmailSender {
  constructor(
    private readonly inner: EmailSender,
    private readonly redirectTo: string | null,
  ) {}

  send(message: EmailMessage): Promise<void> {
    if (this.redirectTo === null) return this.inner.send(message);
    return this.inner.send({ ...message, to: this.redirectTo });
  }
}
