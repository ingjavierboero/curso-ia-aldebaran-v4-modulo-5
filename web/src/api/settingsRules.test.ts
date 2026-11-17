import { describe, expect, it } from 'vitest';
import { EMPTY_SETTINGS, FULL_SETTINGS } from '../test/settingsFixtures';
import {
  IIBB_MAX_LENGTH,
  ISSUER_IVA_CONDITIONS,
  ISSUER_TEXT_MAX_LENGTH,
  POINT_OF_SALE_MAX,
  POINT_OF_SALE_MIN,
  buildSettingsChanges,
  canManageSettings,
  isValidActivityStartDate,
  isValidBillingHour,
  isValidPointOfSale,
  missingNotice,
  toSettingsDraft,
  type SettingsDraft,
} from './settingsRules';
import type { BillingSettings } from './types';

const EMPTY: BillingSettings = structuredClone(EMPTY_SETTINGS) as unknown as BillingSettings;
const FULL: BillingSettings = structuredClone(FULL_SETTINGS) as unknown as BillingSettings;

describe('settingsRules', () => {
  it('las condiciones del emisor son las 4 que emiten Factura C, con su nombre', () => {
    expect(ISSUER_IVA_CONDITIONS).toEqual([
      { code: 4, name: 'IVA Sujeto Exento' },
      { code: 6, name: 'Responsable Monotributo' },
      { code: 13, name: 'Monotributista Social' },
      { code: 16, name: 'Monotributo Trabajador Independiente Promovido' },
    ]);
    expect(ISSUER_TEXT_MAX_LENGTH).toBe(200);
    expect(IIBB_MAX_LENGTH).toBe(50);
    expect([POINT_OF_SALE_MIN, POINT_OF_SALE_MAX]).toEqual([1, 99999]);
  });

  it('la hora es HH:MM entre 00:00 y 23:59', () => {
    for (const valid of ['00:00', '23:59', '11:00', '09:30']) expect(isValidBillingHour(valid), valid).toBe(true);
    for (const invalid of ['24:00', '23:60', '9:00', '', '11:00 ', 'aa:bb', '1100']) {
      expect(isValidBillingHour(invalid), invalid).toBe(false);
    }
  });

  it('el punto de venta es un entero entre 1 y 99999, escrito con dígitos', () => {
    for (const valid of ['1', '5', '99999', ' 42 ']) expect(isValidPointOfSale(valid), valid).toBe(true);
    for (const invalid of ['0', '100000', '2,5', '2.5', '-1', '', 'abc', '1e3']) {
      expect(isValidPointOfSale(invalid), invalid).toBe(false);
    }
  });

  it('la fecha de inicio existe, es desde 1900 y no es posterior a hoy', () => {
    const today = '2026-11-16';
    for (const valid of ['2024-02-29', '1900-01-01', today]) expect(isValidActivityStartDate(valid, today), valid).toBe(true);
    for (const invalid of ['2026-11-17', '1899-12-31', '2020-02-31', '2023-02-29', '16/11/2026', '']) {
      expect(isValidActivityStartDate(invalid, today), invalid).toBe(false);
    }
  });

  it('solo un Admin gestiona la configuración (AC-13)', () => {
    expect(canManageSettings('admin')).toBe(true);
    expect(canManageSettings('editor')).toBe(false);
    expect(canManageSettings('consulta')).toBe(false);
    expect(canManageSettings(undefined)).toBe(false);
  });

  it('el aviso nombra los faltantes en orden y advierte que no se puede facturar (FR-11)', () => {
    expect(missingNotice([])).toBeNull();
    expect(missingNotice([{ field: 'issuerIibb', label: 'número de ingresos brutos' }])).toBe(
      'Falta el dato obligatorio número de ingresos brutos: sin él no se pueden generar facturas.',
    );
    expect(
      missingNotice([
        { field: 'issuerActivityStartDate', label: 'fecha de inicio de actividades' },
        { field: 'pointOfSale', label: 'punto de venta' },
      ]),
    ).toBe(
      'Faltan los datos obligatorios fecha de inicio de actividades y punto de venta: sin ellos no se pueden generar facturas.',
    );
    expect(missingNotice(EMPTY.missing)).toBe(
      'Faltan los datos obligatorios razón social, domicilio comercial, condición frente al IVA, número de ingresos ' +
        'brutos, fecha de inicio de actividades y punto de venta: sin ellos no se pueden generar facturas.',
    );
  });

  it('el borrador del formulario sale del DTO: vacíos como texto vacío', () => {
    expect(toSettingsDraft(EMPTY)).toEqual({
      billingHour: '11:00',
      pointOfSale: '',
      legalName: '',
      address: '',
      ivaCondition: undefined,
      iibb: '',
      activityStartDate: '',
      tradeName: '',
    });
    expect(toSettingsDraft(FULL)).toEqual({
      billingHour: '23:59',
      pointOfSale: '5',
      legalName: 'Aldebaran SRL',
      address: 'Av. Corrientes 1234, CABA',
      ivaCondition: 6,
      iibb: 'CM 901-123456-7',
      activityStartDate: '2024-02-29',
      tradeName: 'Aldebaran',
    });
  });

  it('se envían solo los campos cambiados, con trim y el punto de venta como número', () => {
    const draft: SettingsDraft = {
      ...toSettingsDraft(EMPTY),
      billingHour: '23:59',
      pointOfSale: ' 5 ',
      iibb: '  CM 901-123456-7  ',
      ivaCondition: 6,
    };
    expect(buildSettingsChanges(EMPTY, draft)).toEqual({
      billingHour: '23:59',
      pointOfSale: 5,
      issuer: { ivaCondition: 6, iibb: 'CM 901-123456-7' },
    });

    // Sin cambios (un texto que solo difiere en espacios tampoco es un cambio): nada que enviar.
    expect(buildSettingsChanges(FULL, toSettingsDraft(FULL))).toEqual({});
    expect(buildSettingsChanges(FULL, { ...toSettingsDraft(FULL), legalName: '  Aldebaran SRL ' })).toEqual({});
    expect(buildSettingsChanges(FULL, { ...toSettingsDraft(FULL), tradeName: 'Aldebaran Software' })).toEqual({
      issuer: { tradeName: 'Aldebaran Software' },
    });
  });

  it('un dato vacío nunca se envía: no hay forma de vaciar uno ya guardado', () => {
    const cleared: SettingsDraft = {
      ...toSettingsDraft(FULL),
      pointOfSale: '',
      legalName: '   ',
      iibb: '',
      activityStartDate: '',
      tradeName: '',
      ivaCondition: undefined,
    };
    expect(buildSettingsChanges(FULL, cleared)).toEqual({});
  });
});
