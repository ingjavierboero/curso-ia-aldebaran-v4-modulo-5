import type {
  PasswordResetDelivered,
  PasswordResetDeliveryFailed,
  PasswordResetLog,
} from '../../src/application/auth/PasswordResetLog.js';

/** Guarda los eventos recibidos para que el test los inspeccione. */
export class RecordingPasswordResetLog implements PasswordResetLog {
  readonly deliveries: PasswordResetDelivered[] = [];
  readonly failures: PasswordResetDeliveryFailed[] = [];

  delivered(event: PasswordResetDelivered): void {
    this.deliveries.push({ ...event });
  }

  deliveryFailed(event: PasswordResetDeliveryFailed): void {
    this.failures.push({ ...event });
  }
}
