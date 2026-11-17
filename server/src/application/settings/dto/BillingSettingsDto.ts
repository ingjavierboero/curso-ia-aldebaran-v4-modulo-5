import type { BillingSettings, RequiredBillingSetting } from '../../../domain/settings/BillingSettings.js';
import type { IvaConditionCode } from '../../../domain/shared/IvaCondition.js';

/** Lo que los casos de uso devuelven de la configuración de facturación: valores planos y fechas en texto. */
export interface BillingSettingsDto {
  billingHour: string;
  pointOfSale: number | null;
  issuer: {
    legalName: string | null;
    address: string | null;
    ivaCondition: { code: IvaConditionCode; name: string } | null;
    iibb: string | null;
    activityStartDate: string | null;
    tradeName: string | null;
  };
  /** Obligatorios vacíos, en el orden de `missingRequired()` (FR-11, W4). */
  missing: { field: RequiredBillingSetting; label: string }[];
  /** Fecha del último guardado en ISO, o `null` si no se conoce. */
  updatedAt: string | null;
}

/** Cómo se nombra cada obligatorio en el aviso de faltantes (FR-11). */
const REQUIRED_LABELS: Readonly<Record<RequiredBillingSetting, string>> = Object.freeze({
  issuerLegalName: 'razón social',
  issuerAddress: 'domicilio comercial',
  issuerIvaCondition: 'condición frente al IVA',
  issuerIibb: 'número de ingresos brutos',
  issuerActivityStartDate: 'fecha de inicio de actividades',
  pointOfSale: 'punto de venta',
});

/** Mapper puro: no lee el reloj ni el repositorio; `updatedAt` lo pasa quien llama. */
export function toBillingSettingsDto(settings: BillingSettings, updatedAt: Date | null): BillingSettingsDto {
  const ivaCondition = settings.issuerIvaCondition;
  return {
    billingHour: settings.billingHour.value,
    pointOfSale: settings.pointOfSale?.value ?? null,
    issuer: {
      legalName: settings.issuerLegalName,
      address: settings.issuerAddress,
      ivaCondition: ivaCondition === null ? null : { code: ivaCondition.code, name: ivaCondition.name },
      iibb: settings.issuerIibb,
      activityStartDate: settings.issuerActivityStartDate?.value ?? null,
      tradeName: settings.issuerTradeName,
    },
    missing: settings.missingRequired().map((field) => ({ field, label: REQUIRED_LABELS[field] })),
    updatedAt: updatedAt === null ? null : updatedAt.toISOString(),
  };
}
