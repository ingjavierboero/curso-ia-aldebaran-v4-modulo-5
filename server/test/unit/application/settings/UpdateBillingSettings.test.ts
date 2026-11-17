import { describe, expect, it } from 'vitest';
import { Forbidden } from '../../../../src/domain/auth/errors.js';
import { BillingSettings } from '../../../../src/domain/settings/BillingSettings.js';
import { InvalidActivityStartDate, InvalidIssuerIvaCondition } from '../../../../src/domain/settings/errors.js';
import { createSettingsContext } from '../../../support/settingsContext.js';

const NOW = '2026-11-04T12:00:00.000Z';

const FULL_ISSUER = {
  legalName: '  Aldebaran Software S.R.L.  ',
  address: 'Av. Corrientes 1234, CABA',
  ivaCondition: 6,
  iibb: '  CM 901-123456-7  ',
  activityStartDate: '2020-03-01',
  tradeName: 'Aldebaran',
};

describe('UpdateBillingSettings', () => {
  // Un Admin guarda hora, punto de venta y emisor; lo no enviado se conserva (AC-02, AC-04, AC-06)
  it('test_update_billing_settings_admin_guarda', () => {
    const ctx = createSettingsContext(NOW);

    const saved = ctx.updateBillingSettings.execute(ctx.admin, {
      billingHour: '23:59',
      pointOfSale: 5,
      issuer: FULL_ISSUER,
    });

    expect(saved).toEqual({
      billingHour: '23:59',
      pointOfSale: 5,
      issuer: {
        legalName: 'Aldebaran Software S.R.L.',
        address: 'Av. Corrientes 1234, CABA',
        ivaCondition: { code: 6, name: 'Responsable Monotributo' },
        iibb: 'CM 901-123456-7',
        activityStartDate: '2020-03-01',
        tradeName: 'Aldebaran',
      },
      missing: [],
      updatedAt: NOW,
    });
    expect(ctx.settings.updatedAt?.toISOString()).toBe(NOW);
    const stored = ctx.settings.get();
    expect(stored.billingHour.value).toBe('23:59');
    expect(stored.pointOfSale?.value).toBe(5);
    expect(stored.issuerIibb).toBe('CM 901-123456-7');

    ctx.clock.advance(60_000);
    const partial = ctx.updateBillingSettings.execute(ctx.admin, { issuer: { address: 'Florida 100' } });
    expect(partial.issuer.address).toBe('Florida 100');
    expect(partial.issuer.legalName).toBe('Aldebaran Software S.R.L.');
    expect(partial.billingHour).toBe('23:59');
    expect(partial.pointOfSale).toBe(5);
    expect(partial.updatedAt).toBe('2026-11-04T12:01:00.000Z');
  });

  // Editor y Consulta no pueden modificar: Forbidden y nada cambia (AC-13)
  it('test_update_billing_settings_editor_consulta_forbidden', () => {
    const ctx = createSettingsContext(NOW);

    for (const actor of [ctx.editor, ctx.consulta]) {
      expect(() =>
        ctx.updateBillingSettings.execute(actor, { billingHour: '08:00', pointOfSale: 3, issuer: FULL_ISSUER }),
      ).toThrow(Forbidden);
      // el permiso se rechaza antes de validar: un valor inválido también da Forbidden, no el error
      // de dominio (F1 de la revisión de Block 3)
      expect(() => ctx.updateBillingSettings.execute(actor, { billingHour: '24:00' })).toThrow(Forbidden);
    }

    expect(ctx.settings.updatedAt).toBeNull();
    expect(ctx.settings.get()).toEqual(BillingSettings.defaults());
  });

  // Un Admin dado de baja recibe el error de requireActor y nada cambia
  it('test_update_billing_settings_admin_inactivo_no_autorizado', () => {
    const ctx = createSettingsContext(NOW);

    expect(() => ctx.updateBillingSettings.execute(ctx.inactiveAdmin, { billingHour: '08:00' })).toThrow(Forbidden);

    expect(ctx.settings.updatedAt).toBeNull();
    expect(ctx.settings.get()).toEqual(BillingSettings.defaults());
  });

  // Razón social válida + condición 1: se rechaza todo, sin abrir la transacción (AC-14, NFR-01)
  it('test_update_billing_settings_invalido_no_guarda_nada', () => {
    const ctx = createSettingsContext(NOW);
    ctx.updateBillingSettings.execute(ctx.admin, { billingHour: '10:00' });
    const runsBefore = ctx.uow.runs;

    expect(() =>
      ctx.updateBillingSettings.execute(ctx.admin, {
        billingHour: '12:00',
        issuer: { legalName: 'Aldebaran Software S.R.L.', ivaCondition: 1 },
      }),
    ).toThrow(InvalidIssuerIvaCondition);

    expect(ctx.uow.runs).toBe(runsBefore);
    const stored = ctx.settings.get();
    expect(stored.billingHour.value).toBe('10:00');
    expect(stored.issuerLegalName).toBeNull();
    expect(stored.issuerIvaCondition).toBeNull();
  });

  // Se puede guardar con obligatorios vacíos; `missing` los nombra en orden (AC-10)
  it('test_update_billing_settings_guarda_con_faltantes', () => {
    const ctx = createSettingsContext(NOW);

    const saved = ctx.updateBillingSettings.execute(ctx.admin, {
      pointOfSale: 3,
      issuer: { legalName: 'Aldebaran Software S.R.L.', address: 'Florida 100', ivaCondition: 4 },
    });

    expect(saved.missing).toEqual([
      { field: 'issuerIibb', label: 'número de ingresos brutos' },
      { field: 'issuerActivityStartDate', label: 'fecha de inicio de actividades' },
    ]);
    expect(saved.issuer.ivaCondition).toEqual({ code: 4, name: 'IVA Sujeto Exento' });
    expect(ctx.settings.get().issuerLegalName).toBe('Aldebaran Software S.R.L.');
    expect(ctx.settings.get().pointOfSale?.value).toBe(3);
  });

  // Cargar el último obligatorio que faltaba deja `missing` vacío (AC-11)
  it('test_update_billing_settings_completa_ultimo_faltante', () => {
    const ctx = createSettingsContext(NOW);
    const { tradeName: _tradeName, ...requiredIssuer } = FULL_ISSUER;
    const first = ctx.updateBillingSettings.execute(ctx.admin, { issuer: requiredIssuer });
    expect(first.missing).toEqual([{ field: 'pointOfSale', label: 'punto de venta' }]);

    const completed = ctx.updateBillingSettings.execute(ctx.admin, { pointOfSale: 12 });

    expect(completed.missing).toEqual([]);
    expect(completed.pointOfSale).toBe(12);
    expect(completed.issuer.tradeName).toBeNull();
  });

  // 2026-11-17T02:30Z es todavía el 16/11 en Argentina: el 17 es futuro y el 16 es hoy (AC-08)
  it('test_update_billing_settings_fecha_futura_rechazada_hora_argentina', () => {
    const ctx = createSettingsContext('2026-11-17T02:30:00Z');

    expect(() =>
      ctx.updateBillingSettings.execute(ctx.admin, { issuer: { activityStartDate: '2026-11-17' } }),
    ).toThrow(InvalidActivityStartDate);
    expect(ctx.settings.updatedAt).toBeNull();
    expect(ctx.settings.get().issuerActivityStartDate).toBeNull();

    const saved = ctx.updateBillingSettings.execute(ctx.admin, { issuer: { activityStartDate: '2026-11-16' } });
    expect(saved.issuer.activityStartDate).toBe('2026-11-16');
    expect(ctx.settings.get().issuerActivityStartDate?.value).toBe('2026-11-16');
  });
});
