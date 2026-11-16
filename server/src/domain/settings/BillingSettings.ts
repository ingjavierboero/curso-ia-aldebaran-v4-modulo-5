import type { ActivityStartDate } from './ActivityStartDate.js';
import { BillingHour } from './BillingHour.js';
import type { IssuerIvaCondition } from './IssuerIvaCondition.js';
import { parseIibb, parseIssuerAddress, parseIssuerLegalName, parseIssuerTradeName } from './issuerText.js';
import type { PointOfSale } from './PointOfSale.js';

/** Configuración de facturación: hora (siempre presente) y datos opcionales hasta que se cargan. */
export interface BillingSettingsData {
  billingHour: BillingHour;
  pointOfSale: PointOfSale | null;
  issuerLegalName: string | null;
  issuerAddress: string | null;
  issuerIvaCondition: IssuerIvaCondition | null;
  issuerIibb: string | null;
  issuerActivityStartDate: ActivityStartDate | null;
  issuerTradeName: string | null;
}

/**
 * Cambios ya validados por sus value objects (W2). Una clave ausente, o presente con `undefined`,
 * conserva el valor actual (S-03); no hay forma de vaciar un dato guardado.
 */
export type BillingSettingsChanges = {
  [K in keyof BillingSettingsData]?: NonNullable<BillingSettingsData[K]> | undefined;
};

/** Datos sin los que no se pueden generar facturas, en el orden fijo en que se informan (W4). */
export const REQUIRED_BILLING_SETTINGS = Object.freeze([
  'issuerLegalName',
  'issuerAddress',
  'issuerIvaCondition',
  'issuerIibb',
  'issuerActivityStartDate',
  'pointOfSale',
] as const);

export type RequiredBillingSetting = (typeof REQUIRED_BILLING_SETTINGS)[number];

/**
 * Los textos del emisor se validan también acá, no solo en el caso de uso: un texto vacío o largo
 * nunca entra al agregado ni cuenta como dato cargado (F1 de la revisión de Block 1). Validar dos
 * veces un texto ya recortado no lo cambia.
 */
function validatedTexts(changes: BillingSettingsChanges): BillingSettingsChanges {
  return {
    ...changes,
    issuerLegalName: changes.issuerLegalName === undefined ? undefined : parseIssuerLegalName(changes.issuerLegalName),
    issuerAddress: changes.issuerAddress === undefined ? undefined : parseIssuerAddress(changes.issuerAddress),
    issuerIibb: changes.issuerIibb === undefined ? undefined : parseIibb(changes.issuerIibb),
    issuerTradeName: changes.issuerTradeName === undefined ? undefined : parseIssuerTradeName(changes.issuerTradeName),
  };
}

/**
 * Agregado inmutable de la configuración de facturación. El constructor rehidrata sin validar (lo
 * usa el repositorio); los valores llegan ya tipados por sus value objects. No recibe un `Clock`: el
 * tope de hoy de la fecha de inicio lo aplica quien construye el `ActivityStartDate` (F2).
 */
export class BillingSettings {
  readonly billingHour: BillingHour;
  readonly pointOfSale: PointOfSale | null;
  readonly issuerLegalName: string | null;
  readonly issuerAddress: string | null;
  readonly issuerIvaCondition: IssuerIvaCondition | null;
  readonly issuerIibb: string | null;
  readonly issuerActivityStartDate: ActivityStartDate | null;
  readonly issuerTradeName: string | null;

  constructor(data: BillingSettingsData) {
    this.billingHour = data.billingHour;
    this.pointOfSale = data.pointOfSale;
    this.issuerLegalName = data.issuerLegalName;
    this.issuerAddress = data.issuerAddress;
    this.issuerIvaCondition = data.issuerIvaCondition;
    this.issuerIibb = data.issuerIibb;
    this.issuerActivityStartDate = data.issuerActivityStartDate;
    this.issuerTradeName = data.issuerTradeName;
    Object.freeze(this);
  }

  /** Sistema recién instalado: hora 11:00 y todo lo demás vacío (FR-03, AC-01). */
  static defaults(): BillingSettings {
    return new BillingSettings({
      billingHour: BillingHour.DEFAULT,
      pointOfSale: null,
      issuerLegalName: null,
      issuerAddress: null,
      issuerIvaCondition: null,
      issuerIibb: null,
      issuerActivityStartDate: null,
      issuerTradeName: null,
    });
  }

  /** Una configuración nueva con las claves presentes cambiadas; las demás se conservan (S-03). */
  withChanges(changes: BillingSettingsChanges): BillingSettings {
    const c = validatedTexts(changes);
    // Un campo por línea y sin cast: un campo nuevo de `BillingSettingsData` que falte acá no
    // compila (W1 de la revisión de Block 1). Los valores nunca son null, así que `??` solo
    // reemplaza lo enviado.
    return new BillingSettings({
      billingHour: c.billingHour ?? this.billingHour,
      pointOfSale: c.pointOfSale ?? this.pointOfSale,
      issuerLegalName: c.issuerLegalName ?? this.issuerLegalName,
      issuerAddress: c.issuerAddress ?? this.issuerAddress,
      issuerIvaCondition: c.issuerIvaCondition ?? this.issuerIvaCondition,
      issuerIibb: c.issuerIibb ?? this.issuerIibb,
      issuerActivityStartDate: c.issuerActivityStartDate ?? this.issuerActivityStartDate,
      issuerTradeName: c.issuerTradeName ?? this.issuerTradeName,
    });
  }

  /** Las claves de los obligatorios vacíos, en el orden de `REQUIRED_BILLING_SETTINGS` (FR-11, W4). */
  missingRequired(): RequiredBillingSetting[] {
    return REQUIRED_BILLING_SETTINGS.filter((key) => this[key] === null);
  }

  toData(): BillingSettingsData {
    return {
      billingHour: this.billingHour,
      pointOfSale: this.pointOfSale,
      issuerLegalName: this.issuerLegalName,
      issuerAddress: this.issuerAddress,
      issuerIvaCondition: this.issuerIvaCondition,
      issuerIibb: this.issuerIibb,
      issuerActivityStartDate: this.issuerActivityStartDate,
      issuerTradeName: this.issuerTradeName,
    };
  }
}
