function pad(h: number, m: number) {
  return `${String(((h % 24) + 24) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Normalize a clock string to 24h HH:mm.
 * Understands Huli/Excel forms: "1:00 PM", "1:00 p. m.", serial fractions, ISO datetimes.
 * Hours 01:00–06:59 without a.m./p.m. are treated as afternoon (13:00–18:59),
 * which is how Huli 12-hour exports usually arrive.
 */
export function toTime24h(raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return '';

  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    const fraction = n >= 1 ? n % 1 : n;
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    return pad(Math.floor(totalMinutes / 60), totalMinutes % 60);
  }

  const iso = value.match(/T(\d{2}):(\d{2})/);
  if (iso) return pad(Number(iso[1]), Number(iso[2]));

  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return value;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const compact = value.toLowerCase().replace(/\s+/g, '');
  const isPM = /p\.?m/.test(compact);
  const isAM = /a\.?m/.test(compact);

  if (isPM && hour < 12) hour += 12;
  if (isAM && hour === 12) hour = 0;
  if (!isAM && !isPM && hour >= 1 && hour <= 6) hour += 12;

  return pad(hour, minute);
}

export function compareTimes(left: string | null | undefined, right: string | null | undefined) {
  return toTime24h(left).localeCompare(toTime24h(right));
}
