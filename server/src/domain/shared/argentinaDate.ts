const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

// Zona horaria explícita: no depende de `process.env.TZ` ni de la zona del servidor (F2).
const FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: ARGENTINA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** El día del calendario de Argentina en ese instante, como `YYYY-MM-DD`. */
export function argentinaCalendarDate(instant: Date): string {
  const parts = FORMATTER.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
