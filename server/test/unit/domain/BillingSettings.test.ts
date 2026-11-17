import { describe, expect, it } from 'vitest';
import { ActivityStartDate } from '../../../src/domain/settings/ActivityStartDate.js';
import { BillingHour } from '../../../src/domain/settings/BillingHour.js';
import { BillingSettings, REQUIRED_BILLING_SETTINGS } from '../../../src/domain/settings/BillingSettings.js';
import { InvalidIibb, InvalidIssuerText } from '../../../src/domain/settings/errors.js';
import { IssuerIvaCondition } from '../../../src/domain/settings/IssuerIvaCondition.js';
import { PointOfSale } from '../../../src/domain/settings/PointOfSale.js';

function complete(): BillingSettings {
  return BillingSettings.defaults().withChanges({
    pointOfSale: PointOfSale.of(5),
    issuerLegalName: 'Aldebaran SRL',
    issuerAddress: 'Av. Siempre Viva 742',
    issuerIvaCondition: IssuerIvaCondition.of(6),
    issuerIibb: 'CM 901-123456-7',
    issuerActivityStartDate: ActivityStartDate.parse('2024-02-29', '2026-11-16'),
    issuerTradeName: 'Aldebaran',
  });
}

describe('BillingSettings', () => {
  // Sistema recién instalado: 11:00, sin punto de venta ni datos del emisor (FR-03, AC-01)
  it('test_billing_settings_defaults_hora_11', () => {
    const settings = BillingSettings.defaults();

    expect(settings.billingHour.value).toBe('11:00');
    expect(settings.toData()).toEqual({
      billingHour: BillingHour.DEFAULT,
      pointOfSale: null,
      issuerLegalName: null,
      issuerAddress: null,
      issuerIvaCondition: null,
      issuerIibb: null,
      issuerActivityStartDate: null,
      issuerTradeName: null,
    });
    expect(Object.isFrozen(settings)).toBe(true);
  });

  // Los obligatorios vacíos, en el orden fijo de W4; el nombre de fantasía no cuenta (FR-10, FR-11,
  // AC-10, AC-12)
  it('test_billing_settings_missing_required_en_orden', () => {
    expect(REQUIRED_BILLING_SETTINGS).toEqual([
      'issuerLegalName',
      'issuerAddress',
      'issuerIvaCondition',
      'issuerIibb',
      'issuerActivityStartDate',
      'pointOfSale',
    ]);
    expect(BillingSettings.defaults().missingRequired()).toEqual(REQUIRED_BILLING_SETTINGS);

    // AC-10: todo menos el número de ingresos brutos
    const withoutIibb = BillingSettings.defaults().withChanges({
      pointOfSale: PointOfSale.of(5),
      issuerLegalName: 'Aldebaran SRL',
      issuerAddress: 'Av. Siempre Viva 742',
      issuerIvaCondition: IssuerIvaCondition.of(6),
      issuerActivityStartDate: ActivityStartDate.parse('2024-02-29', '2026-11-16'),
    });
    expect(withoutIibb.missingRequired()).toEqual(['issuerIibb']);

    // AC-12: faltan el punto de venta y la fecha de inicio, en ese orden fijo
    const withoutPosAndStart = BillingSettings.defaults().withChanges({
      issuerLegalName: 'Aldebaran SRL',
      issuerAddress: 'Av. Siempre Viva 742',
      issuerIvaCondition: IssuerIvaCondition.of(6),
      issuerIibb: 'CM 901-123456-7',
    });
    expect(withoutPosAndStart.missingRequired()).toEqual(['issuerActivityStartDate', 'pointOfSale']);

    // AC-11: completo, aunque no tenga nombre de fantasía
    expect(complete().missingRequired()).toEqual([]);
    expect(
      new BillingSettings({ ...complete().toData(), issuerTradeName: null }).missingRequired(),
    ).toEqual([]);
  });

  // Solo cambian las claves enviadas; el resto conserva su valor (S-03, AC-06)
  it('test_billing_settings_with_changes_conserva_no_enviados', () => {
    const before = complete();
    const after = before.withChanges({ billingHour: BillingHour.parse('23:59'), issuerTradeName: 'Nueva' });

    expect(after.billingHour.value).toBe('23:59');
    expect(after.issuerTradeName).toBe('Nueva');
    expect(after.pointOfSale?.value).toBe(5);
    expect(after.issuerLegalName).toBe('Aldebaran SRL');
    expect(after.issuerAddress).toBe('Av. Siempre Viva 742');
    expect(after.issuerIvaCondition?.code).toBe(6);
    expect(after.issuerIibb).toBe('CM 901-123456-7');
    expect(after.issuerActivityStartDate?.value).toBe('2024-02-29');

    // inmutable: el original no cambia
    expect(before.billingHour.value).toBe('11:00');
    expect(before.issuerTradeName).toBe('Aldebaran');

    // una clave presente con `undefined` no borra el valor guardado (no hay forma de vaciar)
    const same = before.withChanges({ issuerLegalName: undefined });
    expect(same.issuerLegalName).toBe('Aldebaran SRL');
    expect(before.withChanges({}).toData()).toEqual(before.toData());
  });

  // Los textos del emisor se validan también dentro del agregado (F1 de la revisión de Block 1)
  it('withChanges rechaza textos del emisor inválidos y guarda los válidos recortados', () => {
    const before = complete();

    expect(() => before.withChanges({ issuerLegalName: '' })).toThrow(InvalidIssuerText);
    expect(() => before.withChanges({ issuerAddress: 'x'.repeat(201) })).toThrow(InvalidIssuerText);
    expect(() => before.withChanges({ issuerTradeName: '   ' })).toThrow(InvalidIssuerText);
    expect(() => before.withChanges({ issuerIibb: '   ' })).toThrow(InvalidIibb);
    expect(() => before.withChanges({ issuerIibb: 'x'.repeat(51) })).toThrow(InvalidIibb);

    const trimmed = before.withChanges({ issuerLegalName: '  Nueva SRL  ', issuerIibb: '  901  ' });
    expect(trimmed.issuerLegalName).toBe('Nueva SRL');
    expect(trimmed.issuerIibb).toBe('901');
  });
});
