import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, getUser } from '../middleware/auth';
import {
  assertDoctorAccess,
  assertDayOpen,
  resolveDoctorFilter,
  formatDateOnly,
  parseDateOnly,
  toNumber,
  todayInMexico,
  writeAudit,
} from '../utils';
import { attendSchema, walkInSchema, classifyAppointmentSchema } from '../../shared/schemas';
import { canSeeAll } from '../../shared/constants';
import type { OperationalStatus } from '@prisma/client';

const router = Router();

router.get('/doctors', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    if (!canSeeAll(user.role)) return res.status(403).json({ error: 'Sin permiso' });
    const doctors = await prisma.doctor.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json({ doctors });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar médicos' });
  }
});

router.get('/day', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const dateStr = (req.query.date as string) || todayInMexico();
    const doctorIdParam = req.query.doctorId as string | undefined;
    const date = parseDateOnly(dateStr);

    const doctorId = resolveDoctorFilter(user, doctorIdParam);

    const whereAppt: Record<string, unknown> = { appointmentDate: date };
    if (doctorId) whereAppt.doctorId = doctorId;

    const whereAtt: Record<string, unknown> = { attendanceDate: date };
    if (doctorId) whereAtt.doctorId = doctorId;

    const [appointments, attendances, closures] = await Promise.all([
      prisma.appointment.findMany({
        where: whereAppt,
        include: { doctor: true, attendance: true },
        orderBy: { startTime: 'asc' },
      }),
      prisma.attendance.findMany({
        where: whereAtt,
        include: { doctor: true, appointment: true, createdBy: { select: { id: true, name: true } } },
        orderBy: { actualTime: 'asc' },
      }),
      prisma.dailyClosure.findMany({
        where: {
          date,
          status: 'CLOSED',
          ...(doctorId ? { doctorId } : {}),
        },
      }),
    ]);

    const closedDoctorIds = closures.map((c) => c.doctorId);
    const closure = doctorId ? closures.find((c) => c.doctorId === doctorId) || null : null;

    const scheduled = appointments.length;
    const attendedFromAppt = appointments.filter((a) => a.operationalStatus === 'ATTENDED').length;
    const pending = appointments.length - attendedFromAppt;
    const cancelledOrNoShow = appointments.filter((a) =>
      ['NO_SHOW', 'CANCELLED', 'RESCHEDULED'].includes(a.operationalStatus)
    ).length;
    const walkIns = attendances.filter((a) => a.origin === 'WALK_IN').length;
    const amount = attendances.reduce((sum, a) => sum + toNumber(a.amount), 0);

    res.json({
      date: dateStr,
      kpis: {
        scheduled,
        attended: attendedFromAppt + walkIns,
        pending,
        cancelledOrNoShow,
        amount,
        walkIns,
      },
      appointments,
      attendances,
      closure,
      closedDoctorIds,
      isClosed: doctorId ? closedDoctorIds.includes(doctorId) : false,
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al cargar el día' });
  }
});

router.get('/appointments', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const {
      date,
      from,
      to,
      doctorId: doctorIdParam,
      status,
      q,
    } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    const doctorId = resolveDoctorFilter(user, doctorIdParam);
    if (doctorId) where.doctorId = doctorId;

    if (date) where.appointmentDate = parseDateOnly(date);
    if (from || to) {
      where.appointmentDate = {};
      if (from) (where.appointmentDate as Record<string, Date>).gte = parseDateOnly(from);
      if (to) (where.appointmentDate as Record<string, Date>).lte = parseDateOnly(to);
    }
    if (status) where.operationalStatus = status;
    if (q) {
      where.OR = [
        { patientName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { externalAppointmentId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: { doctor: true, attendance: true },
      orderBy: [{ appointmentDate: 'desc' }, { startTime: 'asc' }],
      take: 500,
    });
    res.json({ appointments });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al listar citas' });
  }
});

router.get('/appointments/:id', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { doctor: true, attendance: true },
    });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });
    assertDoctorAccess(user, appointment.doctorId);
    res.json({ appointment });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

router.post('/attend', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const parsed = attendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const data = parsed.data;
    const appointment = await prisma.appointment.findUnique({ where: { id: data.appointmentId } });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });
    assertDoctorAccess(user, appointment.doctorId);

    if (!appointment.doctorId) {
      return res.status(400).json({ error: 'La cita no tiene doctor asignado' });
    }

    if (appointment.operationalStatus === 'ATTENDED') {
      return res.status(400).json({ error: 'Esta cita ya fue atendida' });
    }

    const existing = await prisma.attendance.findUnique({
      where: { appointmentId: appointment.id },
    });
    if (existing) {
      return res.status(400).json({ error: 'Ya existe un registro de atención para esta cita' });
    }

    await assertDayOpen(appointment.doctorId, appointment.appointmentDate);

    const result = await prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.create({
        data: {
          appointmentId: appointment.id,
          doctorId: appointment.doctorId!,
          patientName: appointment.patientName,
          phone: appointment.phone,
          email: appointment.email,
          birthDate: appointment.birthDate,
          scheduledTime: appointment.startTime,
          actualTime: data.actualTime,
          treatment: data.treatment.trim(),
          amount: data.amount,
          paymentMethod: data.paymentMethod || 'OTHER',
          notes: data.notes,
          origin: 'SCHEDULED',
          dataSource: 'MANUAL',
          isDemo: appointment.isDemo,
          attendanceDate: appointment.appointmentDate,
          createdById: user.id,
        },
        include: { doctor: true },
      });

      const updated = await tx.appointment.update({
        where: { id: appointment.id },
        data: { operationalStatus: 'ATTENDED', noShowReason: null, noShowNotes: null },
      });

      return { attendance, appointment: updated };
    });

    await writeAudit({
      userId: user.id,
      action: 'ATTEND',
      entityType: 'attendance',
      entityId: result.attendance.id,
      previousValue: { operationalStatus: appointment.operationalStatus },
      newValue: {
        treatment: data.treatment,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        appointmentId: appointment.id,
      },
    });

    res.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al atender' });
  }
});

router.post('/walk-in', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const parsed = walkInSchema.safeParse({
      ...req.body,
      email: req.body.email || undefined,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const data = parsed.data;
    let doctorId = user.doctorId;
    if (canSeeAll(user.role)) {
      doctorId = data.doctorId || null;
    }
    if (!doctorId) {
      return res.status(400).json({ error: 'Doctor requerido' });
    }
    assertDoctorAccess(user, doctorId);

    const dateStr = data.attendanceDate || todayInMexico();
    const date = parseDateOnly(dateStr);

    await assertDayOpen(doctorId, date);

    const attendance = await prisma.attendance.create({
      data: {
        doctorId,
        patientName: data.patientName.trim(),
        phone: data.phone || null,
        email: data.email || null,
        birthDate: data.birthDate ? parseDateOnly(data.birthDate) : null,
        actualTime: data.actualTime,
        treatment: data.treatment.trim(),
        amount: data.amount,
        paymentMethod: data.paymentMethod || 'OTHER',
        notes: data.notes,
        origin: 'WALK_IN',
        dataSource: 'MANUAL',
        attendanceDate: date,
        createdById: user.id,
      },
      include: { doctor: true },
    });

    await writeAudit({
      userId: user.id,
      action: 'WALK_IN',
      entityType: 'attendance',
      entityId: attendance.id,
      newValue: attendance,
    });

    res.json({ attendance });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al registrar paciente sin cita' });
  }
});

router.post('/classify', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const parsed = classifyAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const data = parsed.data;
    const appointment = await prisma.appointment.findUnique({ where: { id: data.appointmentId } });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });
    assertDoctorAccess(user, appointment.doctorId);

    if (appointment.operationalStatus === 'ATTENDED') {
      return res.status(400).json({ error: 'No se puede clasificar una cita ya atendida' });
    }

    await assertDayOpen(appointment.doctorId, appointment.appointmentDate);

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        operationalStatus: data.operationalStatus as OperationalStatus,
        noShowReason: data.reason ?? null,
        noShowNotes: data.notes ?? null,
      },
    });

    await writeAudit({
      userId: user.id,
      action: 'CLASSIFY',
      entityType: 'appointment',
      entityId: appointment.id,
      previousValue: { operationalStatus: appointment.operationalStatus },
      newValue: {
        operationalStatus: data.operationalStatus,
        reason: data.reason,
        notes: data.notes,
      },
    });

    res.json({ appointment: updated });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al clasificar' });
  }
});

router.get('/attendances', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const {
      date,
      from,
      to,
      doctorId: doctorIdParam,
      origin,
      q,
    } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    const doctorId = resolveDoctorFilter(user, doctorIdParam);
    if (doctorId) where.doctorId = doctorId;

    if (date) where.attendanceDate = parseDateOnly(date);
    if (from || to) {
      where.attendanceDate = {};
      if (from) (where.attendanceDate as Record<string, Date>).gte = parseDateOnly(from);
      if (to) (where.attendanceDate as Record<string, Date>).lte = parseDateOnly(to);
    }
    if (origin) where.origin = origin;
    if (q) {
      where.OR = [
        { patientName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { treatment: { contains: q, mode: 'insensitive' } },
      ];
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: { doctor: true, appointment: true, createdBy: { select: { id: true, name: true } } },
      orderBy: [{ attendanceDate: 'desc' }, { actualTime: 'asc' }],
      take: 500,
    });

    const closed = attendances.length
      ? await prisma.dailyClosure.findMany({
          where: {
            status: 'CLOSED',
            OR: attendances.map((a) => ({ doctorId: a.doctorId, date: a.attendanceDate })),
          },
          select: { doctorId: true, date: true },
        })
      : [];
    const closedSet = new Set(closed.map((c) => `${c.doctorId}|${formatDateOnly(c.date)}`));

    res.json({
      attendances: attendances.map((a) => ({
        ...a,
        isDayClosed: closedSet.has(`${a.doctorId}|${formatDateOnly(a.attendanceDate)}`),
      })),
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al listar atenciones' });
  }
});

router.patch('/attendances/:id', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Atención no encontrada' });
    assertDoctorAccess(user, existing.doctorId);

    await assertDayOpen(existing.doctorId, existing.attendanceDate);

    const { treatment, amount, notes, patientName, phone, email, actualTime } = req.body;

    if (amount != null && Number(amount) <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    if (treatment != null && !String(treatment).trim()) {
      return res.status(400).json({ error: 'Tratamiento obligatorio' });
    }

    const updated = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        treatment: treatment != null ? String(treatment).trim() : existing.treatment,
        amount: amount != null ? Number(amount) : existing.amount,
        paymentMethod: existing.paymentMethod,
        notes: notes !== undefined ? notes : existing.notes,
        patientName: patientName != null ? String(patientName).trim() : existing.patientName,
        phone: phone !== undefined ? phone || null : existing.phone,
        email: email !== undefined ? email || null : existing.email,
        actualTime: actualTime ?? existing.actualTime,
      },
      include: { doctor: true },
    });

    await writeAudit({
      userId: user.id,
      action: 'UPDATE_ATTENDANCE',
      entityType: 'attendance',
      entityId: existing.id,
      previousValue: {
        patientName: existing.patientName,
        treatment: existing.treatment,
        amount: existing.amount,
        paymentMethod: existing.paymentMethod,
        notes: existing.notes,
        phone: existing.phone,
        actualTime: existing.actualTime,
      },
      newValue: {
        patientName: updated.patientName,
        treatment: updated.treatment,
        amount: updated.amount,
        paymentMethod: updated.paymentMethod,
        notes: updated.notes,
        phone: updated.phone,
        actualTime: updated.actualTime,
      },
    });

    res.json({ attendance: updated });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al actualizar atención' });
  }
});

router.patch('/appointments/:id', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const existing = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Cita no encontrada' });
    assertDoctorAccess(user, existing.doctorId);

    await assertDayOpen(existing.doctorId, existing.appointmentDate);

    const {
      patientName,
      phone,
      email,
      notes,
      startTime,
      endTime,
      operationalStatus,
      attendanceConfirmation,
      doctorId,
    } = req.body;

    if (user.role !== 'ADMIN' && doctorId && doctorId !== existing.doctorId) {
      return res.status(403).json({ error: 'No puede reasignar el doctor' });
    }

    const data: Record<string, unknown> = {};
    if (patientName != null) data.patientName = String(patientName).trim();
    if (phone !== undefined) data.phone = phone || null;
    if (email !== undefined) data.email = email || null;
    if (notes !== undefined) data.notes = notes || null;
    if (startTime != null) data.startTime = startTime;
    if (endTime !== undefined) data.endTime = endTime || null;
    if (attendanceConfirmation !== undefined) data.attendanceConfirmation = attendanceConfirmation || null;
    if (user.role === 'ADMIN' && doctorId !== undefined) data.doctorId = doctorId || null;
    if (
      operationalStatus &&
      ['PENDING', 'ATTENDED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED'].includes(operationalStatus)
    ) {
      if (existing.operationalStatus === 'ATTENDED' && operationalStatus !== 'ATTENDED' && user.role !== 'ADMIN') {
        return res.status(400).json({ error: 'No puede cambiar el estado de una cita ya atendida' });
      }
      data.operationalStatus = operationalStatus;
    }

    const updated = await prisma.appointment.update({
      where: { id: existing.id },
      data,
      include: { doctor: true, attendance: true },
    });

    await writeAudit({
      userId: user.id,
      action: 'UPDATE_APPOINTMENT',
      entityType: 'appointment',
      entityId: existing.id,
      previousValue: {
        patientName: existing.patientName,
        phone: existing.phone,
        notes: existing.notes,
        startTime: existing.startTime,
        operationalStatus: existing.operationalStatus,
        doctorId: existing.doctorId,
      },
      newValue: {
        patientName: updated.patientName,
        phone: updated.phone,
        notes: updated.notes,
        startTime: updated.startTime,
        operationalStatus: updated.operationalStatus,
        doctorId: updated.doctorId,
      },
    });

    res.json({ appointment: updated });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al actualizar cita' });
  }
});

export default router;
