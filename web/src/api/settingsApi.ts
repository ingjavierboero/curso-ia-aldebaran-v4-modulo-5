import { NetworkError, request } from './client';
import { isOneOf, isRecord } from './guards';
import { ISSUER_IVA_CONDITIONS } from './settingsRules';
import type { BillingSettings, IvaCondition, RequiredBillingSetting, UpdateBillingSettingsInput } from './types';

const PATH = '/api/settings/billing';

const REQUIRED_SETTINGS: readonly RequiredBillingSetting[] = [
  'issuerLegalName',
  'issuerAddress',
  'issuerIvaCondition',
  'issuerIibb',
  'issuerActivityStartDate',
  'pointOfSale',
];

/**
 * Configuración de facturación (`/api/settings/billing`, FEAT-011): los tres perfiles leen; solo el
 * Admin guarda (la autorización real es la del server). El server responde el DTO sin envoltorio. Una
 * respuesta 2xx con una forma que no es la del contrato se trata como `NetworkError`: la UI no muestra
 * datos que no entiende.
 */
export async function getBillingSettings(): Promise<BillingSettings> {
  return settingsOf(await request<unknown>(PATH));
}

/** Envía solo los campos cambiados y devuelve la configuración actualizada. */
export async function updateBillingSettings(input: UpdateBillingSettingsInput): Promise<BillingSettings> {
  return settingsOf(await request<unknown>(PATH, { method: 'PATCH', body: input }));
}

function settingsOf(data: unknown): BillingSettings {
  if (!isBillingSettings(data)) throw new NetworkError();
  return data;
}

function isBillingSettings(value: unknown): value is BillingSettings {
  if (!isRecord(value)) return false;
  const { billingHour, pointOfSale, issuer, missing, updatedAt } = value;
  return (
    typeof billingHour === 'string' &&
    (pointOfSale === null || Number.isSafeInteger(pointOfSale)) &&
    isIssuer(issuer) &&
    Array.isArray(missing) &&
    missing.every(isMissingItem) &&
    isNullableString(updatedAt)
  );
}

function isIssuer(value: unknown): value is BillingSettings['issuer'] {
  if (!isRecord(value)) return false;
  const { legalName, address, ivaCondition, iibb, activityStartDate, tradeName } = value;
  return (
    isNullableString(legalName) &&
    isNullableString(address) &&
    (ivaCondition === null || isIssuerIvaCondition(ivaCondition)) &&
    isNullableString(iibb) &&
    isNullableString(activityStartDate) &&
    isNullableString(tradeName)
  );
}

/** `{ code, name }` con uno de los 4 códigos del emisor (FR-06). */
function isIssuerIvaCondition(value: unknown): value is IvaCondition {
  if (!isRecord(value)) return false;
  const { code, name } = value;
  return typeof name === 'string' && ISSUER_IVA_CONDITIONS.some((condition) => condition.code === code);
}

function isMissingItem(value: unknown): value is BillingSettings['missing'][number] {
  return isRecord(value) && isOneOf(REQUIRED_SETTINGS, value.field) && typeof value.label === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
