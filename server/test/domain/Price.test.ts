import { describe, expect, it } from 'vitest';
import { InvalidCurrency, InvalidPrice } from '../../src/domain/product/errors.js';
import { Price } from '../../src/domain/product/Price.js';

describe('Price', () => {
  // Centavos enteros, ida y vuelta sin redondeo (NFR-03, AC-08)
  it('test_price_ida_y_vuelta_sin_perdida', () => {
    const cases: ReadonlyArray<readonly [string, number, string]> = [
      ['0.01', 1, '0.01'],
      ['15000.5', 1_500_050, '15000.50'],
      ['15000.50', 1_500_050, '15000.50'],
      ['999999999.99', 99_999_999_999, '999999999.99'],
      ['100', 10_000, '100.00'],
      ['0.1', 10, '0.10'],
    ];
    for (const [text, cents, decimal] of cases) {
      const price = Price.parse(text, 'ARS');
      expect(price.cents).toBe(cents);
      expect(price.currency).toBe('ARS');
      expect(price.toDecimalString()).toBe(decimal);
      expect(Price.parse(price.toDecimalString(), 'ARS').cents).toBe(cents);
    }
    expect(Price.parse('15000.50', 'USD').currency).toBe('USD');
    // rehidratación desde la base (centavos)
    expect(Price.fromCents(1_500_050, 'USD').toDecimalString()).toBe('15000.50');
  });

  // Igual o menor a cero (FR-10, AC-09)
  it('test_price_cero_o_negativo_invalido', () => {
    expect(() => Price.parse('0', 'ARS')).toThrow(InvalidPrice);
    expect(() => Price.parse('0.00', 'ARS')).toThrow(InvalidPrice);
    expect(() => Price.parse('-100', 'ARS')).toThrow(InvalidPrice);
    expect(() => Price.fromCents(0, 'ARS')).toThrow(InvalidPrice);
    expect(() => Price.fromCents(-1, 'ARS')).toThrow(InvalidPrice);
  });

  it('test_price_formato_invalido_rechazado', () => {
    for (const text of ['1e3', '+5', '1,50', '1.234', '', ' 5', '5.', '.5', '1000000000', 'NaN', 'Infinity', '１']) {
      expect(() => Price.parse(text, 'ARS'), text).toThrow(InvalidPrice);
    }
    expect(() => Price.parse(15000.5 as unknown as string, 'ARS')).toThrow(InvalidPrice);
    expect(() => Price.fromCents(1.5, 'ARS')).toThrow(InvalidPrice);
    expect(() => Price.fromCents(100_000_000_000, 'ARS')).toThrow(InvalidPrice);
  });

  it('test_currency_invalida_rechazada', () => {
    expect(() => Price.parse('100', 'EUR')).toThrow(InvalidCurrency);
    expect(() => Price.parse('100', 'ars')).toThrow(InvalidCurrency);
    expect(() => Price.parse('100', '')).toThrow(InvalidCurrency);
    expect(() => Price.fromCents(100, 'EUR' as 'ARS')).toThrow(InvalidCurrency);
  });

  // Solo el monto, sin moneda: misma gramática y mismo > 0 que `parse`
  it('parseAmount devuelve centavos y rechaza lo mismo que parse', () => {
    expect(Price.parseAmount('0.01')).toBe(1);
    expect(Price.parseAmount('15000.5')).toBe(1_500_050);
    expect(Price.parseAmount('999999999.99')).toBe(99_999_999_999);
    for (const invalid of ['0', '0.00', '-100', '1e3', '+5', '1,50', '1.234', '', '1000000000']) {
      expect(() => Price.parseAmount(invalid), invalid).toThrow(InvalidPrice);
    }
    expect(() => Price.parseAmount(15 as unknown as string)).toThrow(InvalidPrice);
  });
});
