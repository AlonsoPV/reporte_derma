import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole, getUser } from '../middleware/auth';
import { closeDaySchema, reopenDaySchema } from '../../shared/schemas';
import {
  assertDoctorAccess,
  parseDateOnly,
  resolveDoctorFilter,
  toNumber,
  writeAudit,
} from '../utils';
import type { PaymentMethod } from '@prisma/client';

const router = Router();

async function buildDaySnapshot(doctorId: string, date: Date) {
  const [appointments, attendances] = await Promise.all([
    prisma.appointment.findMany({ where: { doctorId, appointmentDate: date } }),
    prisma.attendance.findMany({ where: { doctorId, attendanceDate: date } }),
  ]);

  const pending = appointments.filter(
    (a) => a.operationalStatus !== 'ATTENDED' && !a.noShowReason
  );
  const treatments: Record<string, number> = {};
  const amounts: Record<PaymentMethod, number> = {
    CASH: 0,
    CARD: 0,
    TRANSFER: 0,
    OTHER: 0,
  };

  for (const a of attendances) {
    treatments[a.treatment] = (treatments[a.treatment] || 0) + 1;
    amounts[a.paymentMethod] += toNumber(a.amount);
  }

  return {
    pending,
    snapshot: {
      scheduledCount: appointments.length,
      attendedCount: attendances.filter((a) => a.origin === 'SCHEDULED').length,
      walkInCount: attendances.filter((a) => a.origin === 'WALK_IN').length,
      noShowCount: appointments.filter((a) => a.operationalStatus === 'NO_SHOW').length,
      cancelledCount: appointments.filter((a) => a.operationalStatus === 'CANCELLED').length,
      rescheduledCount: appointments.filter((a) => a.operationalStatus === 'RESCHEDULED').length,
      totalAmount: attendances.reduce((s, a) => s + toNumber(a.amount), 0),
      cashAmount: amounts.CASH,
      cardAmount: amounts.CARD,
      transferAmount: amounts.TRANSFER,
      otherAmount: amounts.OTHER,
      treatmentsSnapshot: treatments,
    },
  };
}

router.get('/preview', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const dateStr = req.query.date as string;
    if (!dateStr) return res.status(400).json({ error: 'Fecha requerida' });

    const doctorId = resolveDoctorFilter(user, req.query.doctorId as string | undefined);
    if (!doctorId) return res.status(400).json({ error: 'Doctor requerido' });
    assertDoctorAccess(user, doctorId);

    const date = parseDateOnly(dateStr);
    const existing = await prisma.dailyClosure.findUnique({
      where: { doctorId_date: { doctorId, date } },
    });
    const { pending, snapshot } = await buildDaySnapshot(doctorId, date);
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });

    res.json({
      doctor,
      date: dateStr,
      isClosed: existing?.status === 'CLOSED',
      closure: existing,
      pending,
      ...snapshot,
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message || 'Error' });
  }
});

router.post('/close', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const parsed = closeDaySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const doctorId = resolveDoctorFilter(user, parsed.data.doctorId);
    if (!doctorId) return res.status(400).json({ error: 'Doctor requerido' });
    assertDoctorAccess(user, doctorId);

    const date = parseDateOnly(parsed.data.date);
    const { pending, snapshot } = await buildDaySnapshot(doctorId, date);

    if (pending.length > 0) {
      return res.status(400).json({
        error: `Confirma los ${pending.length} pacientes que no fueron atendidos antes de cerrar el día.`,
        pending,
      });
    }

    const existing = await prisma.dailyClosure.findUnique({
      where: { doctorId_date: { doctorId, date } },
    });
    if (existing?.status === 'CLOSED') {
      return res.status(400).json({ error: 'El día ya está cerrado' });
    }

    const closure = existing
      ? await prisma.dailyClosure.update({
          where: { id: existing.id },
          data: {
            ...snapshot,
            status: 'CLOSED',
            closedById: user.id,
            closedAt: new Date(),
            reopenedById: null,
            reopenedAt: null,
            reopenReason: null,
          },
          include: { doctor: true, closedBy: { select: { id: true, name: true } } },
        })
      : await prisma.dailyClosure.create({
          data: {
            doctorId,
            date,
            ...snapshot,
            status: 'CLOSED',
            closedById: user.id,
            closedAt: new Date(),
          },
          include: { doctor: true, closedBy: { select: { id: true, name: true } } },
        });

    await writeAudit({
      userId: user.id,
      action: 'CLOSE_DAY',
      entityType: 'daily_closure',
      entityId: closure.id,
      newValue: snapshot,
    });

    res.json({ closure });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al cerrar el día' });
  }
});

router.post('/reopen', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const user = getUser(req);
    const parsed = reopenDaySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const existing = await prisma.dailyClosure.findUnique({ where: { id: parsed.data.closureId } });
    if (!existing) return res.status(404).json({ error: 'Cierre no encontrado' });
    if (existing.status !== 'CLOSED') {
      return res.status(400).json({ error: 'El día no está cerrado' });
    }

    const closure = await prisma.dailyClosure.update({
      where: { id: existing.id },
      data: {
        status: 'OPEN',
        reopenedById: user.id,
        reopenedAt: new Date(),
        reopenReason: parsed.data.reason,
      },
      include: { doctor: true, reopenedBy: { select: { id: true, name: true } } },
    });

    await writeAudit({
      userId: user.id,
      action: 'REOPEN_DAY',
      entityType: 'daily_closure',
      entityId: closure.id,
      previousValue: { status: 'CLOSED' },
      newValue: { status: 'OPEN', reason: parsed.data.reason },
    });

    res.json({ closure });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al reabrir el día' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const where: Record<string, unknown> = {};
    const doctorId = resolveDoctorFilter(user, req.query.doctorId as string | undefined);
    if (doctorId) where.doctorId = doctorId;

    if (req.query.from || req.query.to) {
      where.date = {};
      if (req.query.from) (where.date as Record<string, Date>).gte = parseDateOnly(req.query.from as string);
      if (req.query.to) (where.date as Record<string, Date>).lte = parseDateOnly(req.query.to as string);
    }

    const closures = await prisma.dailyClosure.findMany({
      where,
      include: {
        doctor: true,
        closedBy: { select: { id: true, name: true } },
        reopenedBy: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
      take: 200,
    });
    res.json({ closures });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al listar cierres' });
  }
});

export default router;
