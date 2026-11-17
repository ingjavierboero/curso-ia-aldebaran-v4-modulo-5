/** La configuración de facturación como la devuelve el server (FEAT-011, DTO de Block 4, sin envoltorio). */

const ALL_MISSING = [
  { field: 'issuerLegalName', label: 'razón social' },
  { field: 'issuerAddress', label: 'domicilio comercial' },
  { field: 'issuerIvaCondition', label: 'condición frente al IVA' },
  { field: 'issuerIibb', label: 'número de ingresos brutos' },
  { field: 'issuerActivityStartDate', label: 'fecha de inicio de actividades' },
  { field: 'pointOfSale', label: 'punto de venta' },
] as const;

/** Un sistema recién instalado (AC-01): hora 11:00 y todo lo demás vacío. */
export const EMPTY_SETTINGS = {
  billingHour: '11:00',
  pointOfSale: null,
  issuer: {
    legalName: null,
    address: null,
    ivaCondition: null,
    iibb: null,
    activityStartDate: null,
    tradeName: null,
  },
  missing: ALL_MISSING,
  updatedAt: null,
} as const;

/** Todo cargado (AC-02, AC-04, AC-06): sin faltantes. */
export const FULL_SETTINGS = {
  billingHour: '23:59',
  pointOfSale: 5,
  issuer: {
    legalName: 'Aldebaran SRL',
    address: 'Av. Corrientes 1234, CABA',
    ivaCondition: { code: 6, name: 'Responsable Monotributo' },
    iibb: 'CM 901-123456-7',
    activityStartDate: '2024-02-29',
    tradeName: 'Aldebaran',
  },
  missing: [],
  updatedAt: '2026-11-16T14:00:00.000Z',
} as const;

/** Faltan el punto de venta y la fecha de inicio de actividades (AC-12). */
export const WITHOUT_POS_AND_START = {
  ...FULL_SETTINGS,
  billingHour: '11:00',
  pointOfSale: null,
  issuer: { ...FULL_SETTINGS.issuer, activityStartDate: null, tradeName: null },
  missing: [ALL_MISSING[4], ALL_MISSING[5]],
  updatedAt: null,
} as const;

/** Guardado sin el número de ingresos brutos (AC-10). */
export const WITHOUT_IIBB = {
  ...FULL_SETTINGS,
  issuer: { ...FULL_SETTINGS.issuer, iibb: null },
  missing: [ALL_MISSING[3]],
} as const;
