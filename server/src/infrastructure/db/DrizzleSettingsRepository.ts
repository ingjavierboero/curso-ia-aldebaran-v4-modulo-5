import { eq } from 'drizzle-orm';
import { ActivityStartDate } from '../../domain/settings/ActivityStartDate.js';
import { BillingHour } from '../../domain/settings/BillingHour.js';
import { BillingSettings } from '../../domain/settings/BillingSettings.js';
import { IssuerIvaCondition } from '../../domain/settings/IssuerIvaCondition.js';
import {
  parseIibb,
  parseIssuerAddress,
  parseIssuerLegalName,
  parseIssuerTradeName,
} from '../../domain/settings/issuerText.js';
import { PointOfSale } from '../../domain/settings/PointOfSale.js';
import type { SettingsRepository } from '../../domain/settings/SettingsRepository.js';
import type { SqliteHandle } from './handle.js';
import { settings } from './schema.js';
import { rehydrate } from './storedValue.js';

type SettingsRow = typeof settings.$inferSelect;
// Solo las columnas de facturación: si otro módulo suma columnas a `settings`, este upsert no las
// escribe (ADR-008; W1 de la revisión de Block 2).
type BillingColumns = Pick<
  SettingsRow,
  | 'billingHour'
  | 'pointOfSale'
  | 'issuerLegalName'
  | 'issuerAddress'
  | 'issuerIvaCondition'
  | 'issuerIibb'
  | 'issuerActivityStart'
  | 'issuerTradeName'
  | 'updatedAt'
>;

/** La única fila de `settings` (ADR-008). */
const ROW_ID = 1;

/**
 * `SettingsRepository` síncrono sobre SQLite (ADR-003). La configuración vive en una sola fila que se
 * crea en el primer guardado; sin fila, devuelve los valores por defecto del dominio (ADR-008).
 */
export class DrizzleSettingsRepository implements SettingsRepository {
  constructor(private readonly db: SqliteHandle) {}

  get(): BillingSettings {
    const row = this.db.select().from(settings).where(eq(settings.id, ROW_ID)).get();
    return row ? toEntity(row) : BillingSettings.defaults();
  }

  /** Upsert de la fila 1 que actualiza solo las columnas de facturación (ADR-008). */
  saveBilling(billing: BillingSettings, updatedAt: Date): void {
    const columns = toBillingColumns(billing, updatedAt);
    this.db
      .insert(settings)
      .values({ id: ROW_ID, ...columns })
      .onConflictDoUpdate({ target: settings.id, set: columns })
      .run();
  }
}

function toBillingColumns(billing: BillingSettings, updatedAt: Date): BillingColumns {
  return {
    billingHour: billing.billingHour.value,
    pointOfSale: billing.pointOfSale?.value ?? null,
    issuerLegalName: billing.issuerLegalName,
    issuerAddress: billing.issuerAddress,
    issuerIvaCondition: billing.issuerIvaCondition?.code ?? null,
    issuerIibb: billing.issuerIibb,
    issuerActivityStart: billing.issuerActivityStartDate?.value ?? null,
    issuerTradeName: billing.issuerTradeName,
    updatedAt: updatedAt.toISOString(),
  };
}

/** Cada columna se revalida con su value object; un valor que el dominio rechaza es `InvalidStoredValue`. */
function toEntity(row: SettingsRow): BillingSettings {
  return new BillingSettings({
    billingHour: rehydrate('settings.billing_hour', () => BillingHour.parse(row.billingHour)),
    pointOfSale: nullable(row.pointOfSale, 'settings.point_of_sale', (n) => PointOfSale.of(n)),
    issuerLegalName: nullable(row.issuerLegalName, 'settings.issuer_legal_name', parseIssuerLegalName),
    issuerAddress: nullable(row.issuerAddress, 'settings.issuer_address', parseIssuerAddress),
    issuerIvaCondition: nullable(row.issuerIvaCondition, 'settings.issuer_iva_condition', (code) =>
      IssuerIvaCondition.of(code),
    ),
    issuerIibb: nullable(row.issuerIibb, 'settings.issuer_iibb', parseIibb),
    issuerActivityStartDate: nullable(row.issuerActivityStart, 'settings.issuer_activity_start', (raw) =>
      ActivityStartDate.rehydrate(raw),
    ),
    issuerTradeName: nullable(row.issuerTradeName, 'settings.issuer_trade_name', parseIssuerTradeName),
  });
}

/** Un opcional vacío sigue vacío; si tiene valor, pasa por `parse` dentro de `rehydrate`. */
function nullable<S, T>(value: S | null, field: string, parse: (raw: S) => T): T | null {
  return value === null ? null : rehydrate(field, () => parse(value));
}
