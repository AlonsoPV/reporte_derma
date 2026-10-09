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
): { status: string; label: string } | null {
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
