/** El email de recuperación salió (FEAT-008, FR-18). */
export interface PasswordResetDelivered {
  userId: string;
  email: string;
}

/** El envío del email de recuperación falló (FEAT-008, FR-04, D-03). */
export interface PasswordResetDeliveryFailed {
  userId: string;
  email: string;
  /** `err.code` si es string; si no, `err.name`. Nunca el mensaje del error ni el texto del email. */
  errorCode: string;
}

/**
 * Puerto síncrono que registra el resultado del envío de cada pedido de recuperación: una línea
 * por pedido, escrita cuando termina el envío. El adaptador agrega la fecha y hora.
 * Contrato: **nunca lanza**; si no puede escribir, descarta el evento. Nunca recibe el token.
 */
export interface PasswordResetLog {
  delivered(event: PasswordResetDelivered): void;
  deliveryFailed(event: PasswordResetDeliveryFailed): void;
}
