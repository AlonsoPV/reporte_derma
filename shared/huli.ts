import { EXPECTED_EXCEL_COLUMNS, type OperationalStatus } from './constants';

export const HULI_EXPORT_COLUMNS = EXPECTED_EXCEL_COLUMNS;

export const HULI_ESTADOS = [
  'Agendada',
  'Cancelada',
  'Completada',
  'Paciente no se presentó',
  'Reagendada',
] as const;

export const HULI_ASISTENCIA = ['Confirmada', 'Sin confirmar'] as const;

export function isHuliBlank(value: unknown) {
  const text = String(value ?? '').trim();
  return !text || text === '-' || text === '—' || text.toLowerCase() === 'n/a';
}

export function huliText(value: unknown) {
  if (isHuliBlank(value)) return '';
  return String(value).trim();
}

export function huliRowValue(row: Record<string, unknown>, column: string) {
  if (Object.prototype.hasOwnProperty.call(row, column)) return row[column];
  const found = Object.keys(row).find((key) => key.replace(/^\uFEFF/, '').trim().toLowerCase() === column.toLowerCase());
  return found ? row[found] : '';
}

export function mapHuliEstado(sourceStatus: string): OperationalStatus {
  const s = sourceStatus.toLowerCase();
  if (s.includes('cancel')) return 'CANCELLED';
  if (s.includes('no se present')) return 'NO_SHOW';
  if (s.includes('reagend')) return 'RESCHEDULED';
  return 'PENDING';
}

export function huliAgendaStatus(
  sourceStatus?: string | null,
  attendanceConfirmation?: string | null,
  operationalStatus?: string | null,
): { status: string; label: string } | null {
  const clinic = (operationalStatus || '').toUpperCase();
  if (clinic === 'CANCELLED') return { status: 'CANCELLED', label: 'Cancelada' };
  if (clinic === 'NO_SHOW') return { status: 'NO_SHOW', label: 'No se presentó' };
  if (clinic === 'RESCHEDULED') return { status: 'RESCHEDULED', label: 'Reagendada' };

  const source = huliText(sourceStatus);
  const confirm = huliText(attendanceConfirmation);
  if (!source && !confirm) return null;

  const s = source.toLowerCase();
  const c = confirm.toLowerCase();
  if (s.includes('cancel')) return { status: 'CANCELLED', label: 'Cancelada' };
  if (s.includes('no se present')) return { status: 'NO_SHOW', label: 'No se presentó' };
  if (s.includes('reagend')) return { status: 'RESCHEDULED', label: 'Reagendada' };
  if (s.includes('complet')) return { status: 'COMPLETADA', label: 'Completada' };
  if (c.includes('sin confirmar') || c.includes('no confirm')) {
    return { status: 'PENDING', label: 'Sin confirmar' };
  }
  if (c.includes('confirm')) return { status: 'CONFIRMADA', label: 'Confirmada' };
  if (source) return { status: 'HULI', label: source };
  return { status: 'HULI', label: confirm };
}

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};

function utcDate(year: number, month: number, day: number): Date | null {
  let y = year;
  if (y < 100) y += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(y, month - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return dt;
}

function mexicoCalendarDate(value: Date): Date | null {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
  const [y, m, d] = iso.split('-').map(Number);
  return utcDate(y, m, d);
}

/** Calendar date from a Huli/Excel Fecha cell, without TZ day-shift. */
export function parseHuliDate(value: unknown): Date | null {
  if (value == null || value === '' || isHuliBlank(value)) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const utcMidnight =
      value.getUTCHours() === 0
      && value.getUTCMinutes() === 0
      && value.getUTCSeconds() === 0
      && value.getUTCMilliseconds() === 0;
    if (utcMidnight) {
      return utcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    }
    return mexicoCalendarDate(value);
  }

  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()))) {
    const serial = Number(value);
    if (serial >= 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
      return utcDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }

  const text = huliText(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parseHuliDate(parsed);
  }

  const iso = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) return utcDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const named = text.match(/^(\d{1,2})\s*(?:de\s*)?([a-záéíóúñ.]+)\s*(?:de\s*)?(\d{2,4})/i);
  if (named) {
    const monthKey = named[2].toLowerCase().replace(/\./g, '').normalize('NFD').replace(/\p{M}/gu, '');
    const month = MONTHS[monthKey];
    if (month) return utcDate(Number(named[3]), month, Number(named[1]));
  }

  return null;
}
