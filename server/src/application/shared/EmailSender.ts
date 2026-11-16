export interface EmailMessage {
  to: string;
  subject: string;
  /** Texto simple (FEAT-008, S-03). */
  text: string;
}

/**
 * Puerto de envío de emails (FEAT-008, ADR-007). Resuelve cuando el servidor de correo aceptó el
 * mensaje; rechaza si falló. Quien lo usa decide si espera o no el resultado.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
