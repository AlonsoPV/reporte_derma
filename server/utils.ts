import { prisma } from './db';
import type { SessionUser } from '../shared/types';
import type { Prisma } from '@prisma/client';
import { canSeeAll } from '../shared/constants';

function jsonSafe(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_key, nested) => {
      if (nested != null && typeof nested === 'object' && typeof (nested as { toNumber?: unknown }).toNumber === 'function') {
        return (nested as { toNumber: () => number }).toNumber();
      }
      if (typeof nested === 'bigint') return nested.toString();
      return nested;
    }),
  ) as Prisma.InputJsonValue;
}

export async function writeAudit(params: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      previousValue: jsonSafe(params.previousValue),
      newValue: jsonSafe(params.newValue),
    },
  });
}

export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object' && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

export function parseDateOnly(value: string): Date {
  // YYYY-MM-DD → UTC date to avoid TZ shifts in @db.Date
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayInMexico(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function nowTimeInMexico(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function doctorScope(user: SessionUser): string | null {
  if (canSeeAll(user.role)) return null;
  if (!user.doctorId) {
    const err = new Error('Usuario sin médico asociado');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return user.doctorId;
}

export function resolveDoctorFilter(user: SessionUser, requested?: string | null): string | null {
  if (canSeeAll(user.role)) return requested || null;
  return doctorScope(user);
}

export function requestedDoctorId(user: SessionUser, requested?: string | null): string | null {
  return resolveDoctorFilter(user, requested);
}

export function assertDoctorAccess(user: SessionUser, doctorId: string | null | undefined) {
  if (canSeeAll(user.role)) return;
  if (!user.doctorId || user.doctorId !== doctorId) {
    const err = new Error('No autorizado para este doctor');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}

export function publicError(e: unknown, fallback: string) {
  const err = e as { status?: number; code?: string; message?: string };
  if (err.status && err.message) return err.message;
  if (err.code === 'P2002' || /unique constraint failed/i.test(err.message || '')) {
    return 'Ese registro ya existe. Recarga la página e intenta de nuevo.';
  }
  if (err.code === 'P2021' || /does not exist in the current database/i.test(err.message || '') || /Invalid `prisma\./.test(err.message || '')) {
    return fallback;
  }
  return err.message || fallback;
}

export async function assertDayOpen(doctorId: string | null | undefined, date: Date) {
  if (!doctorId) return;
  const closed = await prisma.dailyClosure.findUnique({
    where: { doctorId_date: { doctorId, date } },
  });
  if (closed?.status === 'CLOSED') {
    const err = new Error('El día está cerrado. No se permiten cambios. Un administrador debe reabrir el día.');
    (err as Error & { status: number }).status = 409;
    throw err;
  }
}
