import { describe, expect, it } from 'vitest';
import { BillingHour } from '../../src/domain/settings/BillingHour.js';
import { InvalidBillingHour } from '../../src/domain/settings/errors.js';

describe('BillingHour', () => {
  // Los dos extremos del rango 00:00–23:59 son válidos (FR-02, AC-02)
  it('test_billing_hour_valida_2359', () => {
    expect(BillingHour.parse('23:59').value).toBe('23:59');
    expect(BillingHour.parse('00:00').value).toBe('00:00');
    expect(BillingHour.parse('09:05').value).toBe('09:05');
    expect(BillingHour.parse('23:59').equals(BillingHour.parse('23:59'))).toBe(true);
    expect(BillingHour.DEFAULT.value).toBe('11:00');
  });

  // Hora o minutos fuera de rango y formato distinto de HH:MM (FR-02, AC-03)
  it('test_billing_hour_invalida_rechazada', () => {
    expect(() => BillingHour.parse('24:00')).toThrow(InvalidBillingHour);
    expect(() => BillingHour.parse('23:60')).toThrow(InvalidBillingHour);
    expect(() => BillingHour.parse('9:00')).toThrow(InvalidBillingHour);
    expect(() => BillingHour.parse('')).toThrow(InvalidBillingHour);
    expect(() => BillingHour.parse(' 11:00')).toThrow(InvalidBillingHour);
    expect(() => BillingHour.parse('11:00:00')).toThrow(InvalidBillingHour);
    expect(() => BillingHour.parse('１1:00')).toThrow(InvalidBillingHour);
    expect(() => BillingHour.parse(1100 as unknown as string)).toThrow(InvalidBillingHour);
    // el mensaje es fijo y no repite el valor recibido
    expect(() => BillingHour.parse('24:00')).toThrow(new InvalidBillingHour().message);
    expect(new InvalidBillingHour().message).not.toContain('24:00');
  });
});
