const collator = new Intl.Collator('es', { sensitivity: 'base' });

/**
 * Ordena como se lee en español: sin distinguir mayúsculas ni tildes y con la Ñ después de la N
 * (FR-16, FR-18). La base ordena en binario; los listados se reordenan acá. Empata por id para que el
 * orden sea estable entre llamadas.
 */
export function sortBySpanishText<T extends { id: string }>(items: readonly T[], text: (item: T) => string): T[] {
  return [...items].sort((a, b) => collator.compare(text(a), text(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
