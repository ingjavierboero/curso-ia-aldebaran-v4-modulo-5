import { describe, expect, it } from 'vitest';
import { InvalidIibb, InvalidIssuerText } from '../../../src/domain/settings/errors.js';
import {
  IIBB_MAX_LENGTH,
  ISSUER_TEXT_MAX_LENGTH,
  parseIibb,
  parseIssuerAddress,
  parseIssuerLegalName,
  parseIssuerTradeName,
} from '../../../src/domain/settings/issuerText.js';

describe('issuerText', () => {
  // Texto libre con trim, de 1 a 50 caracteres (FR-08, D-03, D-07, AC-09)
  it('test_iibb_trim_y_largo_invalido_rechazado', () => {
    expect(IIBB_MAX_LENGTH).toBe(50);
    expect(parseIibb('  CM 901-123456-7  ')).toBe('CM 901-123456-7');
    expect(parseIibb('x'.repeat(50))).toBe('x'.repeat(50));
    // el largo se cuenta después del trim
    expect(parseIibb(`  ${'x'.repeat(50)}  `)).toBe('x'.repeat(50));

    expect(() => parseIibb('')).toThrow(InvalidIibb);
    expect(() => parseIibb('   ')).toThrow(InvalidIibb);
    expect(() => parseIibb('x'.repeat(51))).toThrow(InvalidIibb);
    expect(() => parseIibb(undefined as unknown as string)).toThrow(InvalidIibb);
  });

  // Razón social, domicilio comercial y nombre de fantasía: trim, de 1 a 200 (S-01)
  it('test_issuer_text_invalido_rechazado', () => {
    expect(ISSUER_TEXT_MAX_LENGTH).toBe(200);
    for (const parse of [parseIssuerLegalName, parseIssuerAddress, parseIssuerTradeName]) {
      expect(parse('  Acme SA  ')).toBe('Acme SA');
      expect(parse('x'.repeat(200))).toBe('x'.repeat(200));

      expect(() => parse('')).toThrow(InvalidIssuerText);
      expect(() => parse('   ')).toThrow(InvalidIssuerText);
      expect(() => parse('x'.repeat(201))).toThrow(InvalidIssuerText);
      expect(() => parse(null as unknown as string)).toThrow(InvalidIssuerText);
    }
  });
});
