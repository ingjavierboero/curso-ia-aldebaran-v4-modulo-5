/** Lo que se registra cuando falla la lectura de las corridas de un proceso (FR-06, NFR-03). */
export interface JobReadFailedEvent {
  jobName: string;
  /** El nombre del error (`err.name`), o `typeof err` si no es un `Error`. Nunca el mensaje. */
  errorType: string;
}

/**
 * Puerto síncrono para los eventos del chequeo de salud. El adaptador agrega la fecha y hora.
 * Contrato: **nunca lanza**; si no puede escribir, descarta el evento.
 */
export interface HealthEventLog {
  jobReadFailed(event: JobReadFailedEvent): void;
}
