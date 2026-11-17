import type { BillingSettings } from './BillingSettings.js';

/**
 * Puerto síncrono (ADR-003): nada de Promises, para poder usarse dentro de una UnitOfWork. La
 * configuración es una sola fila (ADR-008).
 */
export interface SettingsRepository {
  /** La configuración de facturación guardada; si todavía no hay ninguna, `BillingSettings.defaults()`. */
  get(): BillingSettings;
  /** Guarda todos los valores de facturación de `settings` y la fecha del cambio. */
  saveBilling(settings: BillingSettings, updatedAt: Date): void;
}
