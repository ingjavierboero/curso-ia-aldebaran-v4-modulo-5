import type { FormRule } from 'antd';
import type { CatalogStatus, Currency, IvaCondition, UserRole } from './types';

/**
 * Valores, límites y validaciones de clientes y productos (FEAT-010), los mismos que aplica el
 * server. Viven fuera de los componentes: un módulo de componentes que exporta constantes rompe el
 * Fast Refresh. Son UX: la validación real la hace el server.
 */

/** Condiciones frente al IVA admitidas para el receptor de una Factura C (FR-04), en orden de código. */
export const IVA_CONDITIONS: readonly IvaCondition[] = [
  { code: 1, name: 'IVA Responsable Inscripto' },
  { code: 4, name: 'IVA Sujeto Exento' },
  { code: 5, name: 'Consumidor Final' },
  { code: 6, name: 'Responsable Monotributo' },
  { code: 7, name: 'Sujeto No Categorizado' },
  { code: 8, name: 'Proveedor del Exterior' },
  { code: 9, name: 'Cliente del Exterior' },
  { code: 10, name: 'IVA Liberado – Ley N° 19.640' },
  { code: 13, name: 'Monotributista Social' },
  { code: 15, name: 'IVA No Alcanzado' },
  { code: 16, name: 'Monotributo Trabajador Independiente Promovido' },
];

export const CURRENCIES: readonly Currency[] = ['ARS', 'USD'];
export const CURRENCY_LABELS: Readonly<Record<Currency, string>> = { ARS: 'Pesos (ARS)', USD: 'Dólares (USD)' };
export const CATALOG_STATUSES: readonly CatalogStatus[] = ['activo', 'inactivo'];

export const CLIENT_BUSINESS_NAME_MAX_LENGTH = 200;
export const CLIENT_ADDRESS_MAX_LENGTH = 200;
/** 11 dígitos más guiones y espacios: el tope de forma del server. */
export const CUIT_MAX_LENGTH = 20;
export const BILLING_EMAIL_MAX_LENGTH = 254;
export const PRODUCT_NAME_MAX_LENGTH = 100;

/** Admin y Editor gestionan; Consulta solo ve (AC-16). */
export function canManageCatalog(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'editor';
}

// --- CUIT -------------------------------------------------------------------------------------

const CUIT_FORMAT = /^[0-9]{11}$/;
/** Prefijos admitidos (D-05): personas humanas 20/23/24/27, personas jurídicas 30/33/34. */
const CUIT_PREFIXES: ReadonlySet<string> = new Set(['20', '23', '24', '27', '30', '33', '34']);
const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Quita guiones y espacios (S-03). */
export function normalizeCuit(raw: string): string {
  return raw.replace(/[-\s]/g, '');
}

/** 11 dígitos, prefijo admitido y dígito verificador módulo 11 (FR-05), como `Cuit.parse` del server. */
export function isValidCuit(raw: string): boolean {
  const digits = normalizeCuit(raw);
  if (!CUIT_FORMAT.test(digits) || !CUIT_PREFIXES.has(digits.slice(0, 2))) return false;
  const sum = CUIT_WEIGHTS.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0);
  const dv = 11 - (sum % 11);
  if (dv === 10) return false;
  return (dv === 11 ? 0 : dv) === Number(digits[10]);
}

/** `30711111111` → `30-71111111-1`; otro texto queda igual. */
export function formatCuit(cuit: string): string {
  if (!CUIT_FORMAT.test(cuit)) return cuit;
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

// --- Precio -----------------------------------------------------------------------------------

/** Precio como se escribe: hasta 9 enteros y hasta 2 decimales, con coma (es-AR) o punto. */
const PRICE_INPUT_FORMAT = /^\d{1,9}([.,]\d{1,2})?$/;
/**
 * Precio del contrato, como lo devuelve el server (`toDecimalString`): hasta 9 enteros, punto y
 * siempre 2 decimales (`"15000.50"`). Única definición: la usan `productsApi` para validar la
 * respuesta y `formatPrice` para mostrarla.
 */
export const API_PRICE_FORMAT = /^(\d{1,9})\.(\d{2})$/;

/** Formato válido y mayor a cero (algún dígito distinto de 0), sin convertirlo a número. */
export function isValidPrice(text: string): boolean {
  const trimmed = text.trim();
  return PRICE_INPUT_FORMAT.test(trimmed) && /[1-9]/.test(trimmed);
}

/** Del texto del formulario al del contrato: la coma decimal pasa a punto, como texto (NFR-03). */
export function toApiPrice(text: string): string {
  return text.trim().replace(',', '.');
}

/** Del contrato al formulario: `"15000.50"` → `"15000,50"`. */
export function toInputPrice(price: string): string {
  return price.replace('.', ',');
}

const CURRENCY_SYMBOLS: Readonly<Record<Currency, string>> = { ARS: '$', USD: 'US$' };
const INTEGER_FORMAT = new Intl.NumberFormat('es-AR');

/**
 * `"15000.50"` → `"$ 15.000,50"`. La parte entera se agrupa con `Intl.NumberFormat('es-AR')` sobre un
 * `BigInt` y los centavos se agregan como texto: el precio nunca pasa por un float. Un texto fuera de
 * `API_PRICE_FORMAT` se muestra tal cual.
 */
export function formatPrice(price: string, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const match = API_PRICE_FORMAT.exec(price);
  if (match === null) return `${symbol} ${price}`;
  const [, integerPart = '', cents = ''] = match;
  return `${symbol} ${INTEGER_FORMAT.format(BigInt(integerPart))},${cents}`;
}

// --- Fechas -----------------------------------------------------------------------------------

/** Las fechas se muestran en la hora del negocio (AGENTS.md: TZ de Buenos Aires). */
const DATE_FORMAT = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Fecha ISO del server → `16/11/2026`. Un texto que no es una fecha se muestra tal cual. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

// --- Reglas de formulario ---------------------------------------------------------------------

export const CUIT_RULES: FormRule[] = [
  { required: true, whitespace: true, message: 'Ingresá el CUIT' },
  {
    validator(_rule, value: unknown) {
      if (typeof value !== 'string' || value.trim() === '' || isValidCuit(value)) return Promise.resolve();
      return Promise.reject(new Error('El CUIT no es válido'));
    },
  },
];

export const PRICE_RULES: FormRule[] = [
  { required: true, whitespace: true, message: 'Ingresá el precio' },
  {
    validator(_rule, value: unknown) {
      if (typeof value !== 'string' || value.trim() === '' || isValidPrice(value)) return Promise.resolve();
      return Promise.reject(new Error('Ingresá un precio mayor a cero, con hasta 9 enteros y 2 decimales'));
    },
  },
];
