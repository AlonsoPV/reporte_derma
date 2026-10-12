import type { OperationalStatus } from './constants';

const CLASSIFIED: OperationalStatus[] = ['NO_SHOW', 'CANCELLED', 'RESCHEDULED'];

export function normalizeMatchKey(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\b(dra?|dr)\.?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function namesMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeMatchKey(left);
  const b = normalizeMatchKey(right);
  return Boolean(a && b && a === b);
}

export function matchDoctorId(
  excelName: string | null | undefined,
  doctors: Array<{ id: string; name: string }>,
  mappedNames?: Map<string, string>,
): string | null {
  const key = normalizeMatchKey(excelName);
  if (!key) return null;
  if (mappedNames?.has(key)) return mappedNames.get(key) || null;
  const exact = doctors.find((d) => normalizeMatchKey(d.name) === key);
  if (exact) return exact.id;
  const tokens = key.split(' ').filter((t) => t.length > 1);
  if (tokens.length < 2) return null;
  const hits = doctors.filter((d) => {
    const n = normalizeMatchKey(d.name);
    if (n.includes(key) || key.includes(n)) return true;
    return tokens.every((t) => n.includes(t));
  });
  return hits.length === 1 ? hits[0].id : null;
}

export function hasLinkedAttendance(appointment: {
  attendance?: unknown | null;
  attendances?: unknown[] | null;
  isAttended?: boolean;
}) {
  if (typeof appointment.isAttended === 'boolean') return appointment.isAttended;
  if (Array.isArray(appointment.attendances)) return appointment.attendances.length > 0;
  return Boolean(appointment.attendance);
}

export function effectiveStatus(appointment: {
  operationalStatus: string;
  attendance?: unknown | null;
  isAttended?: boolean;
}): OperationalStatus {
  if (hasLinkedAttendance(appointment)) return 'ATTENDED';
  return appointment.operationalStatus as OperationalStatus;
}

export function isOnAgenda(appointment: {
  operationalStatus: string;
  attendance?: unknown | null;
  isAttended?: boolean;
}) {
  return effectiveStatus(appointment) !== 'ATTENDED';
}

export function isPendingOnAgenda(appointment: {
  operationalStatus: string;
  attendance?: unknown | null;
  isAttended?: boolean;
}) {
  return effectiveStatus(appointment) === 'PENDING';
}

export function isClassifiedOnAgenda(appointment: {
  operationalStatus: string;
  attendance?: unknown | null;
  isAttended?: boolean;
}) {
  return CLASSIFIED.includes(effectiveStatus(appointment));
}

export function buildDayKpis<
  A extends { operationalStatus: string; attendance?: unknown | null; isAttended?: boolean },
  T extends { origin: string; amount?: number | string | null },
>(appointments: A[], attendances: T[], toNumber: (value: unknown) => number) {
  const pending = appointments.filter(isPendingOnAgenda).length;
  const cancelledOrNoShow = appointments.filter(isClassifiedOnAgenda).length;
  const walkIns = attendances.filter((a) => a.origin === 'WALK_IN').length;
  return {
    scheduled: appointments.length,
    attended: attendances.length,
    pending,
    cancelledOrNoShow,
    walkIns,
    amount: attendances.reduce((sum, a) => sum + toNumber(a.amount), 0),
  };
}
