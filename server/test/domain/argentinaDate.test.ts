import { describe, expect, it } from 'vitest';
import { argentinaCalendarDate } from '../../src/domain/shared/argentinaDate.js';

describe('argentinaCalendarDate', () => {
  // 02:30 UTC del 17 son las 23:30 del 16 en Argentina (UTC−3), sin depender de process.env.TZ (F2)
  it('test_argentina_date_borde_medianoche', () => {
    expect(argentinaCalendarDate(new Date('2026-11-17T02:30:00Z'))).toBe('2026-11-16');
    expect(argentinaCalendarDate(new Date('2026-11-17T02:59:59.999Z'))).toBe('2026-11-16');
    expect(argentinaCalendarDate(new Date('2026-11-17T03:00:00Z'))).toBe('2026-11-17');
    expect(argentinaCalendarDate(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31');
    expect(argentinaCalendarDate(new Date('2024-02-29T12:00:00Z'))).toBe('2024-02-29');
  });
});
