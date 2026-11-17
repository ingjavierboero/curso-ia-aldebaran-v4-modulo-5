import { describe, expect, it } from 'vitest';
import { sortBySpanishText } from '../../../src/application/shared/spanishOrder.js';

describe('sortBySpanishText', () => {
  // Si Node corre sin ICU completo, el collator cae a otro locale y el orden visible cambia en
  // silencio: este test lo hace fallar a la vista.
  it('el runtime tiene la colación en español', () => {
    expect(new Intl.Collator('es').resolvedOptions().locale.startsWith('es')).toBe(true);
  });

  it('ordena como en español: sin mayúsculas ni tildes, Ñ después de N, empate por id', () => {
    const items = [
      { id: '3', name: 'Zeta' },
      { id: '1', name: 'Ñandú' },
      { id: '4', name: 'nube' },
      { id: '2', name: 'agenda' },
      { id: '0', name: 'Árbol' },
      { id: '5', name: 'árbol' },
    ];

    const sorted = sortBySpanishText(items, (item) => item.name).map((item) => item.name);

    expect(sorted).toEqual(['agenda', 'Árbol', 'árbol', 'nube', 'Ñandú', 'Zeta']);
    expect(sorted.indexOf('Ñandú')).toBeGreaterThan(sorted.indexOf('nube'));
    expect(sorted.indexOf('agenda')).toBeLessThan(sorted.indexOf('Zeta'));
  });
});
