import { IVA_CONDITIONS } from './catalogRules';
import type { BillingSettings, IvaCondition, UpdateBillingSettingsInput, UserRole } from './types';

/**
 * Valores, límites y reglas de la configuración de facturación (FEAT-011), los mismos que aplica el
 * server. Viven fuera del componente: un módulo de componentes que exporta constantes rompe el Fast
 * Refresh. Son solo de interfaz: la validación real es la del server (W9).
 */

/** Códigos de las condiciones que emiten Factura C (FR-06), como `ISSUER_IVA_CONDITIONS` del server. */
const ISSUER_IVA_CODES: ReadonlySet<number> = new Set([4, 6, 13, 16]);

/** Condiciones frente al IVA admitidas para la empresa emisora, en orden de código y con su nombre. */
export const ISSUER_IVA_CONDITIONS: readonly IvaCondition[] = IVA_CONDITIONS.filter((c) => ISSUER_IVA_CODES.has(c.code));

/** Razón social, domicilio comercial y nombre de fantasía (S-01). */
export const ISSUER_TEXT_MAX_LENGTH = 200;
/** Número de ingresos brutos (D-03). */
export const IIBB_MAX_LENGTH = 50;
export const POINT_OF_SALE_MIN = 1;
export const POINT_OF_SALE_MAX = 99999;
/** Fecha de inicio de actividades más antigua admitida (S-02). */
export const ACTIVITY_START_MIN_DATE = '1900-01-01';

/** Solo un Admin cambia la configuración; Editor y Consulta la ven (AC-13). */
export function canManageSettings(role: UserRole | undefined): boolean {
  return role === 'admin';
}

/** `HH:MM` entre 00:00 y 23:59 (FR-02). */
const BILLING_HOUR_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidBillingHour(raw: string): boolean {
  return BILLING_HOUR_FORMAT.test(raw);
}

/** Solo dígitos (ni coma, ni punto, ni exponente), entre 1 y 99999 (FR-04). */
export function isValidPointOfSale(raw: string): boolean {
  const trimmed = raw.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return false;
  const value = Number(trimmed);
  return value >= POINT_OF_SALE_MIN && value <= POINT_OF_SALE_MAX;
}

const ISO_DATE_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `YYYY-MM-DD`, fecha existente del calendario, entre el 01/01/1900 y `today` (`YYYY-MM-DD`). Con la
 * fecha del navegador es solo una ayuda: el server aplica el día de Argentina (FR-07, W9).
 */
export function isValidActivityStartDate(raw: string, today: string): boolean {
  const match = ISO_DATE_FORMAT.exec(raw);
  if (match === null) return false;
  const [, year = '', month = '', day = ''] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const exists =
    date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
  // Mismo formato de ancho fijo: la comparación de textos es la de fechas.
  return exists && raw >= ACTIVITY_START_MIN_DATE && raw <= today;
}

/**
 * Texto del aviso de faltantes (FR-11): nombra los datos con el `label` del server, en su orden, y
 * advierte que sin ellos no se puede facturar. `null` si no falta nada.
 */
export function missingNotice(missing: BillingSettings['missing']): string | null {
  const labels = missing.map((m) => m.label);
  if (labels.length === 0) return null;
  if (labels.length === 1) {
    return `Falta el dato obligatorio ${labels[0] ?? ''}: sin él no se pueden generar facturas.`;
  }
  const list = `${labels.slice(0, -1).join(', ')} y ${labels.at(-1) ?? ''}`;
  return `Faltan los datos obligatorios ${list}: sin ellos no se pueden generar facturas.`;
}

/**
 * Lo que muestra y edita el formulario, todo como texto (salvo la condición frente al IVA, que es el
 * código elegido). Un dato no cargado es texto vacío; la fecha va como `YYYY-MM-DD` o vacía.
 */
export interface SettingsDraft {
  billingHour: string;
  pointOfSale: string;
  legalName: string;
  address: string;
  ivaCondition: number | undefined;
  iibb: string;
  activityStartDate: string;
  tradeName: string;
}

export function toSettingsDraft(settings: BillingSettings): SettingsDraft {
  const { issuer } = settings;
  return {
    billingHour: settings.billingHour,
    pointOfSale: settings.pointOfSale === null ? '' : String(settings.pointOfSale),
    legalName: issuer.legalName ?? '',
    address: issuer.address ?? '',
    ivaCondition: issuer.ivaCondition?.code,
    iibb: issuer.iibb ?? '',
    activityStartDate: issuer.activityStartDate ?? '',
    tradeName: issuer.tradeName ?? '',
  };
}

/**
 * Body del PATCH con solo los campos cambiados respecto de lo guardado (`{}` si no cambió nada). Los
 * textos van con trim; un dato vacío no se envía nunca, porque no hay forma de vaciar uno ya guardado
 * (el formulario además lo marca como error).
 */
export function buildSettingsChanges(current: BillingSettings, draft: SettingsDraft): UpdateBillingSettingsInput {
  const saved = toSettingsDraft(current);
  const changes: UpdateBillingSettingsInput = {};

  const billingHour = draft.billingHour.trim();
  if (billingHour !== '' && billingHour !== saved.billingHour) changes.billingHour = billingHour;

  const pointOfSale = draft.pointOfSale.trim();
  if (pointOfSale !== '' && Number(pointOfSale) !== current.pointOfSale) changes.pointOfSale = Number(pointOfSale);

  const issuer: NonNullable<UpdateBillingSettingsInput['issuer']> = {};
  for (const key of ['legalName', 'address', 'iibb', 'activityStartDate', 'tradeName'] as const) {
    const value = draft[key].trim();
    if (value !== '' && value !== saved[key]) issuer[key] = value;
  }
  if (draft.ivaCondition !== undefined && draft.ivaCondition !== saved.ivaCondition) issuer.ivaCondition = draft.ivaCondition;

  if (Object.keys(issuer).length > 0) changes.issuer = issuer;
  return changes;
}
