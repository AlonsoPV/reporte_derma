import { prisma } from './db';
import type { SessionUser } from '../shared/types';
import type { Prisma } from '@prisma/client';

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
      previousValue: (params.previousValue ?? undefined) as Prisma.InputJsonValue | undefined,
      newValue: (params.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
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
  if (user.role === 'ADMIN') return null;
  if (!user.doctorId) {
    const err = new Error('Usuario sin médico asociado');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return user.doctorId;
}

export function resolveDoctorFilter(user: SessionUser, requested?: string | null): string | null {
  if (user.role === 'ADMIN') return requested || null;
  return doctorScope(user);
}

export function requestedDoctorId(user: SessionUser, requested?: string | null): string | null {
  return resolveDoctorFilter(user, requested);
}

export function assertDoctorAccess(user: SessionUser, doctorId: string | null | undefined) {
  if (user.role === 'ADMIN') return;
  if (!user.doctorId || user.doctorId !== doctorId) {
    const err = new Error('No autorizado para este doctor');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
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
