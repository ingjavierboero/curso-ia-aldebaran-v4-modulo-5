import { describe, expect, it } from 'vitest';
import { Forbidden } from '../../../../src/domain/auth/errors.js';
import { createSettingsContext } from '../../../support/settingsContext.js';

/** Lo que ve cualquiera en un sistema recién instalado (AC-01). */
const FRESH = {
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
  missing: [
    { field: 'issuerLegalName', label: 'razón social' },
    { field: 'issuerAddress', label: 'domicilio comercial' },
    { field: 'issuerIvaCondition', label: 'condición frente al IVA' },
    { field: 'issuerIibb', label: 'número de ingresos brutos' },
    { field: 'issuerActivityStartDate', label: 'fecha de inicio de actividades' },
    { field: 'pointOfSale', label: 'punto de venta' },
  ],
  updatedAt: null,
};

describe('GetBillingSettings', () => {
  // Admin, Editor y Consulta leen la configuración: la de fábrica y la que guardó un Admin (AC-01, AC-13)
  it('test_get_billing_settings_tres_perfiles', () => {
    const ctx = createSettingsContext();

    for (const actor of [ctx.admin, ctx.editor, ctx.consulta]) {
      expect(ctx.getBillingSettings.execute(actor)).toEqual(FRESH);
    }

    ctx.updateBillingSettings.execute(ctx.admin, { billingHour: '09:30', pointOfSale: 7 });

    for (const actor of [ctx.admin, ctx.editor, ctx.consulta]) {
      const read = ctx.getBillingSettings.execute(actor);
      expect(read.billingHour).toBe('09:30');
      expect(read.pointOfSale).toBe(7);
      expect(read.missing.map((m) => m.field)).toEqual([
        'issuerLegalName',
        'issuerAddress',
        'issuerIvaCondition',
        'issuerIibb',
        'issuerActivityStartDate',
      ]);
    }
  });

  // A diferencia de ListClients, el GET relee al actor: un Admin dado de baja no lee (W3 de la revisión)
  it('un actor Inactivo no puede leer la configuración', () => {
    const ctx = createSettingsContext();

    expect(() => ctx.getBillingSettings.execute(ctx.inactiveAdmin)).toThrow(Forbidden);
  });
});
