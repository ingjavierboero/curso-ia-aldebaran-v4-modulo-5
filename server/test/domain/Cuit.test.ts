import { describe, expect, it } from 'vitest';
import { Cuit } from '../../src/domain/client/Cuit.js';
import { InvalidCuit } from '../../src/domain/client/errors.js';

describe('Cuit', () => {
  // Con o sin guiones o espacios, se guarda solo con los 11 dígitos (S-03, AC-06)
  it('test_cuit_valido_30711111111', () => {
    expect(Cuit.parse('30-71111111-1').value).toBe('30711111111');
    expect(Cuit.parse('30711111111').value).toBe('30711111111');
    expect(Cuit.parse(' 30 71111111 1 ').value).toBe('30711111111');
    // `\s` también cubre tabulador y espacio duro (NBSP)
    expect(Cuit.parse('30\t71111111\t1').value).toBe('30711111111');
    expect(Cuit.parse('30 71111111 1').value).toBe('30711111111');
    expect(Cuit.parse('20-12345678-6').value).toBe('20123456786');
    // suma múltiplo de 11: 11 − 0 = 11 → dígito 0
    expect(Cuit.parse('20-00000006-0').value).toBe('20000000060');
    expect(Cuit.parse('30711111111').equals(Cuit.parse('30-71111111-1'))).toBe(true);
  });

  // Dígito verificador incorrecto (AC-06)
  it('test_cuit_digito_verificador_invalido_rechazado', () => {
    expect(() => Cuit.parse('30711111118')).toThrow(InvalidCuit);
    expect(() => Cuit.parse('30-71111111-8')).toThrow(InvalidCuit);
    // 20-12345678-x: solo el 6 es válido
    expect(() => Cuit.parse('20123456785')).toThrow(InvalidCuit);
    // 20-00000001-x da 11 − 1 = 10: ningún dígito verificador es válido
    for (const dv of '0123456789') {
      expect(() => Cuit.parse(`2000000001${dv}`)).toThrow(InvalidCuit);
    }
  });

  // Prefijo fuera de {20, 23, 24, 27, 30, 33, 34} (D-05, AC-06)
  it('test_cuit_prefijo_invalido_rechazado', () => {
    // 00000000000 pasa el módulo 11 (dígito 0): solo lo rechaza el prefijo
    expect(() => Cuit.parse('00000000000')).toThrow(InvalidCuit);
    // dígito verificador válido (módulo 11), pero prefijo 10 y 99: los rechaza solo el prefijo
    expect(() => Cuit.parse('10111111117')).toThrow(InvalidCuit);
    expect(() => Cuit.parse('99111111118')).toThrow(InvalidCuit);
  });

  it('test_cuit_formato_invalido_rechazado', () => {
    expect(() => Cuit.parse('3071111111')).toThrow(InvalidCuit); // 10 dígitos
    expect(() => Cuit.parse('307111111111')).toThrow(InvalidCuit); // 12 dígitos
    expect(() => Cuit.parse('30-7111111A-1')).toThrow(InvalidCuit); // letras
    expect(() => Cuit.parse('')).toThrow(InvalidCuit);
    expect(() => Cuit.parse('30.71111111.1')).toThrow(InvalidCuit); // solo se quitan guiones y espacios
    expect(() => Cuit.parse('３0711111111')).toThrow(InvalidCuit); // dígito no ASCII
    expect(() => Cuit.parse(30711111111 as unknown as string)).toThrow(InvalidCuit);
  });
});
