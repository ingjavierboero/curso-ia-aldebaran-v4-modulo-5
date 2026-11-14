/** Puerto síncrono (ADR-003, ADR-005): si la base responde. Nunca lanza ni expone el error. */
export interface DatabaseProbe {
  isAvailable(): boolean;
}
