import { describe, expect, it } from 'vitest';
import { InvalidStoredDate, parseIsoDate } from '../../src/infrastructure/db/parseIsoDate.js';

describe('parseIsoDate', () => {
  it('devuelve la fecha de un ISO 8601 válido', () => {
    expect(parseIsoDate('2026-11-14T10:00:00.000Z', 'job_runs.finished_at').toISOString()).toBe(
      '2026-11-14T10:00:00.000Z',
    );
  });

  // AC-08: el tipo del error dice qué pasó (el log registra `err.name`), y sigue siendo un `Error`
  it('test_parse_iso_date_invalida_lanza_invalid_stored_date', () => {
    let caught: unknown;
    try {
      parseIsoDate('zzz-no-es-fecha', 'job_runs.finished_at');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(InvalidStoredDate);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('InvalidStoredDate');
    expect((caught as Error).message).toBe(
      'Fecha inválida en job_runs.finished_at: "zzz-no-es-fecha" no es un ISO 8601 válido',
    );
  });
});
