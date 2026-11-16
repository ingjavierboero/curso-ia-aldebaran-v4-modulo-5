import { describe, expect, it } from 'vitest';
import { parseBoundedText } from '../../src/domain/shared/boundedText.js';

class SampleError extends Error {
  override readonly name = 'SampleError';
}

const makeError = (): Error => new SampleError('texto inválido');

describe('parseBoundedText', () => {
  it('recorta los espacios y acepta de 1 a max caracteres', () => {
    expect(parseBoundedText('  Acme  ', 10, makeError)).toBe('Acme');
    expect(parseBoundedText('x', 10, makeError)).toBe('x');
    expect(parseBoundedText('x'.repeat(10), 10, makeError)).toBe('x'.repeat(10));
  });

  it('lanza el error de la fábrica si está vacío, supera el máximo o no es texto', () => {
    expect(() => parseBoundedText('', 10, makeError)).toThrow(SampleError);
    expect(() => parseBoundedText('   ', 10, makeError)).toThrow(SampleError);
    expect(() => parseBoundedText('x'.repeat(11), 10, makeError)).toThrow(SampleError);
    expect(() => parseBoundedText(undefined as unknown as string, 10, makeError)).toThrow('texto inválido');
  });
});
