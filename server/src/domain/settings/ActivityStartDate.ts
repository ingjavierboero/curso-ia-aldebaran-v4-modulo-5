import { InvalidActivityStartDate } from './errors.js';

const DATE_FORMAT = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
/** Fecha mínima admitida (S-02). */
export const ACTIVITY_START_MIN_DATE = '1900-01-01';

/**
 * Value object: fecha de inicio de actividades de la empresa emisora, `YYYY-MM-DD`, existente en el
 * calendario y desde el 01/01/1900 (FR-07, S-02). `parse` además exige que no sea posterior a hoy.
 */
export class ActivityStartDate {
  private constructor(readonly value: string) {}

  /**
   * Para un valor que carga un usuario: `today` es el día actual en Argentina (`YYYY-MM-DD`), que
   * calcula el caso de uso (F2). Si no cumple, `InvalidActivityStartDate`.
   */
  static parse(raw: string, today: string): ActivityStartDate {
    const date = ActivityStartDate.rehydrate(raw);
    // En `YYYY-MM-DD` el orden de texto coincide con el orden de las fechas.
    if (date.value > today) throw new InvalidActivityStartDate();
    return date;
  }

  /** Para un valor ya guardado: las mismas reglas sin el tope de hoy (W5). */
  static rehydrate(raw: string): ActivityStartDate {
    if (typeof raw !== 'string') throw new InvalidActivityStartDate();
    const match = DATE_FORMAT.exec(raw);
    if (match === null) throw new InvalidActivityStartDate();
    if (!isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
      throw new InvalidActivityStartDate();
    }
    if (raw < ACTIVITY_START_MIN_DATE) throw new InvalidActivityStartDate();
    return new ActivityStartDate(raw);
  }

  equals(other: ActivityStartDate): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  // Día 0 del mes siguiente = último día de este mes, en UTC para no depender de la zona horaria.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay;
}
