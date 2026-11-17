import { BillingSettings } from '../../src/domain/settings/BillingSettings.js';
import type { SettingsRepository } from '../../src/domain/settings/SettingsRepository.js';

/** Contenido del doble: la fila guardada, o `null` si todavía no hay ninguna. */
export interface SettingsSnapshot {
  billing: BillingSettings | null;
  updatedAt: Date | null;
}

/**
 * Doble en memoria de la fila única de `settings` (ADR-008): sin nada guardado devuelve los valores
 * por defecto del dominio; `saveBilling` reemplaza la configuración de facturación.
 */
export class InMemorySettingsRepository implements SettingsRepository {
  private billing: BillingSettings | null = null;
  private savedAt: Date | null = null;

  /** `updated_at` de la fila guardada, o `null` si no hay fila. */
  get updatedAt(): Date | null {
    return this.savedAt;
  }

  get(): BillingSettings {
    return this.billing ?? BillingSettings.defaults();
  }

  saveBilling(settings: BillingSettings, updatedAt: Date): void {
    this.billing = settings;
    this.savedAt = new Date(updatedAt.getTime());
  }

  /** Foto del contenido, para que `InMemoryUnitOfWork` pueda hacer rollback. */
  snapshot(): SettingsSnapshot {
    return { billing: this.billing, updatedAt: this.savedAt };
  }

  restore(snapshot: SettingsSnapshot): void {
    this.billing = snapshot.billing;
    this.savedAt = snapshot.updatedAt;
  }
}
