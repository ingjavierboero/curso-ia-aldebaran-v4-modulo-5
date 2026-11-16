import { describe, expect, it } from 'vitest';
import {
  API_PRICE_FORMAT,
  IVA_CONDITIONS,
  formatDate,
  canManageCatalog,
  formatCuit,
  formatPrice,
  isValidCuit,
  isValidPrice,
  normalizeCuit,
  toApiPrice,
  toInputPrice,
} from './catalogRules';

describe('catalogRules', () => {
  it('las condiciones frente al IVA son las 11 del server, con su nombre', () => {
    expect(IVA_CONDITIONS.map((c) => c.code)).toEqual([1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16]);
    expect(IVA_CONDITIONS.find((c) => c.code === 1)?.name).toBe('IVA Responsable Inscripto');
    expect(IVA_CONDITIONS.find((c) => c.code === 10)?.name).toBe('IVA Liberado – Ley N° 19.640');
    expect(IVA_CONDITIONS.every((c) => c.name.length > 0)).toBe(true);
  });

  it('el CUIT se valida con el mismo algoritmo y prefijos que el server', () => {
    expect(normalizeCuit(' 30-71111111-1 ')).toBe('30711111111');
    expect(formatCuit('30711111111')).toBe('30-71111111-1');
    expect(formatCuit('3071')).toBe('3071');
    expect(isValidCuit('30-71111111-1')).toBe(true);
    expect(isValidCuit('20123456786')).toBe(true);
    expect(isValidCuit('27 23456789 1')).toBe(true);
    // Dígito verificador inválido, prefijos inválidos (00000000000 pasa el módulo 11), largo y letras.
    for (const invalid of ['30711111118', '00000000000', '11111111111', '3071111111', '307111111112', '30a11111111', '']) {
      expect(isValidCuit(invalid), invalid).toBe(false);
    }
  });

  it('el precio acepta coma o punto, hasta 9 enteros y 2 decimales, mayor a cero', () => {
    for (const valid of ['15000.50', '15000,5', '0,01', '999999999.99', '1']) {
      expect(isValidPrice(valid), valid).toBe(true);
    }
    for (const invalid of ['0', '0,00', '-100', '1,234', '1.234', '1e3', '+5', '1.000,50', '1234567890', '', 'abc']) {
      expect(isValidPrice(invalid), invalid).toBe(false);
    }
  });

  it('toApiPrice cambia la coma por punto como texto, sin pasar por un número', () => {
    expect(toApiPrice('15000,50')).toBe('15000.50');
    expect(toApiPrice(' 0,01 ')).toBe('0.01');
    expect(toApiPrice('999999999,99')).toBe('999999999.99');
    expect(toApiPrice('15000.5')).toBe('15000.5');
    expect(toInputPrice('15000.50')).toBe('15000,50');
  });

  it('formatPrice usa el formato es-AR a partir de la parte entera y los centavos', () => {
    expect(formatPrice('15000.50', 'ARS')).toBe('$ 15.000,50');
    expect(formatPrice('0.01', 'ARS')).toBe('$ 0,01');
    expect(formatPrice('999999999.99', 'USD')).toBe('US$ 999.999.999,99');
    // Un texto fuera del contrato (`API_PRICE_FORMAT`) se muestra tal cual, sin inventar un número.
    expect(formatPrice('abc', 'ARS')).toBe('$ abc');
    expect(formatPrice('1200.5', 'USD')).toBe('US$ 1200.5');
    expect(API_PRICE_FORMAT.test('15000.50')).toBe(true);
    for (const invalid of ['15000.5', '1e3', '1234567890.00', '-1.00']) {
      expect(API_PRICE_FORMAT.test(invalid), invalid).toBe(false);
    }
  });

  it('formatDate muestra la fecha de alta en es-AR, en la hora de Buenos Aires', () => {
    expect(formatDate('2026-11-16T12:00:00.000Z')).toBe('16/11/2026');
    // 02:00 UTC del 17 son las 23:00 del 16 en Buenos Aires.
    expect(formatDate('2026-11-17T02:00:00.000Z')).toBe('16/11/2026');
    expect(formatDate('no es una fecha')).toBe('no es una fecha');
  });

  it('solo Admin y Editor gestionan clientes y productos', () => {
    expect(canManageCatalog('admin')).toBe(true);
    expect(canManageCatalog('editor')).toBe(true);
    expect(canManageCatalog('consulta')).toBe(false);
    expect(canManageCatalog(undefined)).toBe(false);
  });
});
