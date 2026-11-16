import { describe, expect, it } from 'vitest';
import { ActivityStartDate } from '../../src/domain/settings/ActivityStartDate.js';
import { InvalidActivityStartDate } from '../../src/domain/settings/errors.js';

const TODAY = '2026-11-16';

describe('ActivityStartDate', () => {
  // Fecha inexistente, posterior a hoy o anterior a 1900 (FR-07, AC-08, S-02)
  it('test_activity_start_fecha_inexistente_o_futura_rechazada', () => {
    expect(() => ActivityStartDate.parse('2020-02-31', TODAY)).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse('2026-11-17', TODAY)).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse('2027-01-01', '2026-12-31')).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse('1899-12-31', TODAY)).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse('2023-02-29', TODAY)).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse('2020-13-01', TODAY)).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse('2020-00-10', TODAY)).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse('2020-1-1', TODAY)).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse('29/02/2024', TODAY)).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse('', TODAY)).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse('2024-02-29T00:00', TODAY)).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.parse(20240229 as unknown as string, TODAY)).toThrow(InvalidActivityStartDate);

    // rehydrate aplica las mismas reglas salvo el tope de hoy (W5)
    expect(ActivityStartDate.rehydrate('2026-11-17').value).toBe('2026-11-17');
    expect(() => ActivityStartDate.rehydrate('2020-02-31')).toThrow(InvalidActivityStartDate);
    expect(() => ActivityStartDate.rehydrate('1899-12-31')).toThrow(InvalidActivityStartDate);
  });

  // El 29/02 de un año bisiesto, el día de hoy y el 01/01/1900 son válidos (FR-05, AC-06, AC-08)
  it('test_activity_start_hoy_y_bisiesto_validos', () => {
    expect(ActivityStartDate.parse('2024-02-29', TODAY).value).toBe('2024-02-29');
    expect(ActivityStartDate.parse(TODAY, TODAY).value).toBe(TODAY);
    expect(ActivityStartDate.parse('1900-01-01', TODAY).value).toBe('1900-01-01');
    expect(ActivityStartDate.parse('2000-02-29', TODAY).value).toBe('2000-02-29');
    expect(ActivityStartDate.parse(TODAY, TODAY).equals(ActivityStartDate.rehydrate(TODAY))).toBe(true);
  });
});
