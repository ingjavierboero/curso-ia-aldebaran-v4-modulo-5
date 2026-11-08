import { describe, expect, it } from 'vitest';
import { parsePort } from '../../src/infrastructure/http/parsePort.js';

describe('parsePort', () => {
  it('sin PORT usa 3000', () => {
    expect(parsePort(undefined)).toBe(3000);
  });

  it('acepta enteros entre 1 y 65535', () => {
    expect(parsePort('1')).toBe(1);
    expect(parsePort('8080')).toBe(8080);
    expect(parsePort('65535')).toBe(65535);
  });

  it('rechaza lo que no es un entero entre 1 y 65535 (error)', () => {
    for (const raw of ['', ' ', '0', '65536', '-1', '80.5', '1e3', '0x50', 'abc', '3000abc', ' 3000']) {
      expect(() => parsePort(raw), raw).toThrow(/PORT/);
    }
  });
});
