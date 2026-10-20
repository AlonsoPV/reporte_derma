import { Router, type Request, type Response } from 'express';
import { ensurePrescriptionTables, prisma } from '../db';
import { requireAuth, getUser } from '../middleware/auth';
import {
  assertDoctorAccess,
  assertDayOpen,
  resolveDoctorFilter,
  formatDateOnly,
  parseDateOnly,
  publicError,
  toNumber,
  todayInMexico,
  writeAudit,
} from '../utils';
import { z } from 'zod';
import { attendanceLineSchema, attendSchema, walkInSchema, classifyAppointmentSchema, recipeLineSchema } from '../../shared/schemas';
import { canBypassClosedDay, canSeeAll } from '../../shared/constants';
import { buildDayKpis } from '../../shared/match';
import { toTime24h } from '../../shared/time';
import type { OperationalStatus, Prisma } from '@prisma/client';

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
        include: { doctor: true, attendances: { select: { id: true } } },
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
    const kpis = buildDayKpis(appointments, attendances, toNumber);

    const recipeMap = await recipeMapFor(attendances);
    const lagged = appointments.filter((a) => a.attendances.length && a.operationalStatus !== 'ATTENDED');
    if (lagged.length) {
      await prisma.appointment.updateMany({
        where: { id: { in: lagged.map((a) => a.id) } },
        data: { operationalStatus: 'ATTENDED', noShowReason: null, noShowNotes: null },
      });
    }

    res.json({
      date: dateStr,
      kpis,
      appointments: appointments.map((a) => ({
        ...a,
        isAttended: a.attendances.length > 0,
        operationalStatus: a.attendances.length ? 'ATTENDED' : a.operationalStatus,
      })),
      attendances: attendances.map((a) => ({
        ...a,
        amount: toNumber(a.amount),
        recipe: recipeMap.get(a.id) ?? [],
      })),
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
      include: { doctor: true, attendances: { select: { id: true } } },
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
      include: { doctor: true, attendances: { select: { id: true } } },
    });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });
    assertDoctorAccess(user, appointment.doctorId);
    res.json({ appointment });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

async function savePrescription(
  tx: Prisma.TransactionClient,
  input: {
    recipe?: Array<{ category: string; productName: string; usage: string; recommendation: string }>;
    appointmentId?: string | null;
    doctorId: string;
    patientName: string;
    phone?: string | null;
    attendanceDate: Date;
    createdById: string;
    lookupPatientName?: string;
  },
) {
  const previous = input.appointmentId
    ? await tx.prescription.findUnique({ where: { appointmentId: input.appointmentId } })
    : input.lookupPatientName
      ? await tx.prescription.findFirst({
          where: {
            appointmentId: null,
            doctorId: input.doctorId,
            attendanceDate: input.attendanceDate,
            patientName: input.lookupPatientName,
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;
  if (previous) {
    await tx.prescriptionItem.deleteMany({ where: { prescriptionId: previous.id } });
    await tx.prescription.delete({ where: { id: previous.id } });
  }
  if (!input.recipe?.length) return null;
  return tx.prescription.create({
    data: {
      appointmentId: input.appointmentId || null,
      doctorId: input.doctorId,
      patientName: input.patientName,
      phone: input.phone || null,
      attendanceDate: input.attendanceDate,
      createdById: input.createdById,
      items: {
        create: input.recipe.map((item, index) => ({
          sortOrder: index,
          category: item.category,
          productName: item.productName,
          usage: item.usage,
          recommendation: item.recommendation,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
}

function serializeRecipe(items: Array<{ id: string; category: string; productName: string; usage: string; recommendation: string }> | undefined) {
  return (items ?? []).map((item) => ({
    id: item.id,
    category: item.category,
    productName: item.productName,
    usage: item.usage,
    recommendation: item.recommendation,
  }));
}

async function recipeMapFor(rows: Array<{
  id: string;
  appointmentId: string | null;
  doctorId: string;
  patientName: string;
  attendanceDate: Date;
}>) {
  const map = new Map<string, ReturnType<typeof serializeRecipe>>();
  if (!rows.length) return map;
  try {
    await ensurePrescriptionTables();
    const appointmentIds = [...new Set(rows.map((row) => row.appointmentId).filter((id): id is string => Boolean(id)))];
    const doctorIds = [...new Set(rows.map((row) => row.doctorId))];
    const dates = [...new Map(rows.map((row) => [formatDateOnly(row.attendanceDate), row.attendanceDate])).values()];
    const or: Prisma.PrescriptionWhereInput[] = [];
    if (appointmentIds.length) or.push({ appointmentId: { in: appointmentIds } });
    if (doctorIds.length && dates.length) {
      or.push({ appointmentId: null, doctorId: { in: doctorIds }, attendanceDate: { in: dates } });
    }
    if (!or.length) return map;
    const prescriptions = await prisma.prescription.findMany({
      where: { OR: or },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    for (const row of rows) {
      const match = row.appointmentId
        ? prescriptions.find((item) => item.appointmentId === row.appointmentId)
        : prescriptions.find((item) => (
            !item.appointmentId
            && item.doctorId === row.doctorId
            && item.patientName === row.patientName
            && formatDateOnly(item.attendanceDate) === formatDateOnly(row.attendanceDate)
          ));
      map.set(row.id, serializeRecipe(match?.items));
    }
  } catch (error) {
    console.error('recipe map', error);
  }
  return map;
}

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

    const existing = await prisma.attendance.findFirst({
      where: { appointmentId: appointment.id },
      select: { id: true },
    });
    if (existing) {
      return res.status(400).json({ error: 'Ya existe un registro de atención para esta cita' });
    }

    await assertDayOpen(appointment.doctorId, appointment.appointmentDate);
    if (data.recipe?.length) await ensurePrescriptionTables();

    const result = await prisma.$transaction(async (tx) => {
      const attendances = [];
      for (const item of data.items) {
        attendances.push(await tx.attendance.create({
          data: {
            appointmentId: appointment.id,
            doctorId: appointment.doctorId!,
            patientName: appointment.patientName,
            phone: appointment.phone,
            email: appointment.email,
            birthDate: appointment.birthDate,
            scheduledTime: appointment.startTime,
            actualTime: data.actualTime,
            treatment: item.treatment,
            amount: item.amount,
            paymentMethod: data.paymentMethod || 'OTHER',
            notes: item.notes || null,
            origin: 'SCHEDULED',
            dataSource: 'MANUAL',
            isDemo: appointment.isDemo,
            attendanceDate: appointment.appointmentDate,
            createdById: user.id,
          },
          include: { doctor: true },
        }));
      }

      const updated = await tx.appointment.update({
        where: { id: appointment.id },
        data: { operationalStatus: 'ATTENDED', noShowReason: null, noShowNotes: null },
      });

      const prescription = await savePrescription(tx, {
        recipe: data.recipe,
        appointmentId: appointment.id,
        doctorId: appointment.doctorId!,
        patientName: appointment.patientName,
        phone: appointment.phone,
        attendanceDate: appointment.appointmentDate,
        createdById: user.id,
      });

      return { attendances, appointment: updated, prescription };
    });

    await writeAudit({
      userId: user.id,
      action: 'ATTEND',
      entityType: 'attendance',
      entityId: result.attendances[0]?.id,
      previousValue: { operationalStatus: appointment.operationalStatus },
      newValue: {
        items: data.items,
        recipe: data.recipe,
        paymentMethod: data.paymentMethod,
        appointmentId: appointment.id,
      },
    });

    res.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: publicError(e, 'Error al atender') });
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
    if (data.recipe?.length) await ensurePrescriptionTables();

    const result = await prisma.$transaction(async (tx) => {
      const attendances = [];
      for (const item of data.items) {
        attendances.push(await tx.attendance.create({
          data: {
            doctorId,
            patientName: data.patientName.trim(),
            phone: data.phone || null,
            email: data.email || null,
            birthDate: data.birthDate ? parseDateOnly(data.birthDate) : null,
            actualTime: data.actualTime,
            treatment: item.treatment,
            amount: item.amount,
            paymentMethod: data.paymentMethod || 'OTHER',
            notes: item.notes || null,
            origin: 'WALK_IN',
            dataSource: 'MANUAL',
            attendanceDate: date,
            createdById: user.id,
          },
          include: { doctor: true },
        }));
      }
      const prescription = await savePrescription(tx, {
        recipe: data.recipe,
        doctorId,
        patientName: data.patientName.trim(),
        phone: data.phone,
        attendanceDate: date,
        createdById: user.id,
      });
      return { attendances, prescription };
    });
    const attendances = result.attendances;

    await writeAudit({
      userId: user.id,
      action: 'WALK_IN',
      entityType: 'attendance',
      entityId: attendances[0]?.id,
      newValue: { items: data.items, recipe: data.recipe, patientName: data.patientName },
    });

    res.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: publicError(e, 'Error al registrar paciente sin cita') });
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

    const existingAttendance = await prisma.attendance.findFirst({
      where: { appointmentId: appointment.id },
      select: { id: true },
    });
    if (existingAttendance || appointment.operationalStatus === 'ATTENDED') {
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
          select: { id: true, doctorId: true, date: true },
        })
      : [];
    const closedMap = new Map(closed.map((c) => [`${c.doctorId}|${formatDateOnly(c.date)}`, c.id]));
    const recipeMap = await recipeMapFor(attendances);

    res.json({
      attendances: attendances.map((a) => {
        const key = `${a.doctorId}|${formatDateOnly(a.attendanceDate)}`;
        return {
          ...a,
          amount: toNumber(a.amount),
          isDayClosed: closedMap.has(key),
          closureId: closedMap.get(key) || null,
          recipe: recipeMap.get(a.id) ?? [],
        };
      }),
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al listar atenciones' });
  }
});

async function updateAttendanceHandler(req: Request, res: Response) {
  try {
    const user = getUser(req);
    const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Atención no encontrada' });
    assertDoctorAccess(user, existing.doctorId);

    if (!canBypassClosedDay(user.role)) {
      await assertDayOpen(existing.doctorId, existing.attendanceDate);
    }

    const { treatment, amount, notes, patientName, phone, email, actualTime, recipe, extraItems } = req.body ?? {};

    if (amount != null && amount !== '' && toNumber(amount) <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    if (treatment != null && !String(treatment).trim()) {
      return res.status(400).json({ error: 'Tratamiento obligatorio' });
    }

    let extraLines: Array<{ treatment: string; amount: number; notes?: string }> = [];
    if (extraItems !== undefined) {
      const parsedExtra = z.array(attendanceLineSchema).max(20).safeParse(extraItems);
      if (!parsedExtra.success) {
        return res.status(400).json({ error: parsedExtra.error.errors[0]?.message ?? 'Procedimiento inválido' });
      }
      extraLines = parsedExtra.data;
    }

    let nextRecipe: Array<{ category: string; productName: string; usage: string; recommendation: string }> | undefined;
    if (recipe !== undefined) {
      const parsedRecipe = z.array(recipeLineSchema).max(20).safeParse(recipe);
      if (!parsedRecipe.success) {
        return res.status(400).json({ error: parsedRecipe.error.errors[0]?.message ?? 'Receta inválida' });
      }
      nextRecipe = parsedRecipe.data;
      await ensurePrescriptionTables();
    }

    const nextTime = actualTime != null && String(actualTime).trim()
      ? (toTime24h(String(actualTime)) || existing.actualTime)
      : existing.actualTime;
    const nextName = patientName != null ? String(patientName).trim() : existing.patientName;
    const nextPhone = phone !== undefined ? phone || null : existing.phone;
    const nextEmail = email !== undefined ? email || null : existing.email;

    const updated = await prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.update({
        where: { id: existing.id },
        data: {
          treatment: treatment != null ? String(treatment).trim() : existing.treatment,
          amount: amount != null && amount !== '' ? toNumber(amount) : existing.amount,
          paymentMethod: existing.paymentMethod,
          notes: notes !== undefined ? notes || null : existing.notes,
          patientName: nextName,
          phone: nextPhone,
          email: nextEmail,
          actualTime: nextTime,
        },
        include: { doctor: true },
      });

      if (!existing.appointmentId && (nextName !== existing.patientName || nextPhone !== existing.phone || nextEmail !== existing.email)) {
        await tx.attendance.updateMany({
          where: {
            id: { not: existing.id },
            appointmentId: null,
            doctorId: existing.doctorId,
            attendanceDate: existing.attendanceDate,
            patientName: existing.patientName,
            origin: 'WALK_IN',
          },
          data: { patientName: nextName, phone: nextPhone, email: nextEmail },
        });
      }

      const prescription = nextRecipe === undefined
        ? null
        : await savePrescription(tx, {
            recipe: nextRecipe,
            appointmentId: existing.appointmentId,
            doctorId: existing.doctorId,
            patientName: nextName,
            phone: nextPhone,
            attendanceDate: existing.attendanceDate,
            createdById: user.id,
            lookupPatientName: existing.patientName,
          });

      const added = [];
      for (const item of extraLines) {
        added.push(await tx.attendance.create({
          data: {
            appointmentId: existing.appointmentId,
            doctorId: existing.doctorId,
            patientName: nextName,
            phone: nextPhone,
            email: nextEmail,
            birthDate: existing.birthDate,
            scheduledTime: existing.scheduledTime,
            actualTime: nextTime,
            treatment: item.treatment,
            amount: item.amount,
            paymentMethod: existing.paymentMethod,
            notes: item.notes || null,
            origin: existing.origin,
            dataSource: 'MANUAL',
            isDemo: existing.isDemo,
            attendanceDate: existing.attendanceDate,
            createdById: user.id,
          },
          include: { doctor: true },
        }));
      }

      return {
        attendance,
        added,
        recipe: nextRecipe === undefined ? undefined : serializeRecipe(prescription?.items),
      };
    });

    try {
      await writeAudit({
        userId: user.id,
        action: 'UPDATE_ATTENDANCE',
        entityType: 'attendance',
        entityId: existing.id,
        previousValue: {
          patientName: existing.patientName,
          treatment: existing.treatment,
          amount: toNumber(existing.amount),
          paymentMethod: existing.paymentMethod,
          notes: existing.notes,
          phone: existing.phone,
          actualTime: existing.actualTime,
        },
        newValue: {
          patientName: updated.attendance.patientName,
          treatment: updated.attendance.treatment,
          amount: toNumber(updated.attendance.amount),
          paymentMethod: updated.attendance.paymentMethod,
          notes: updated.attendance.notes,
          phone: updated.attendance.phone,
          actualTime: updated.attendance.actualTime,
          recipe: updated.recipe,
          extraItems: extraLines,
        },
      });
    } catch (auditErr) {
      console.error('audit UPDATE_ATTENDANCE', auditErr);
    }

    res.json({
      attendance: {
        ...updated.attendance,
        amount: toNumber(updated.attendance.amount),
        ...(updated.recipe !== undefined ? { recipe: updated.recipe } : {}),
      },
      added: updated.added.map((row) => ({ ...row, amount: toNumber(row.amount) })),
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: publicError(e, 'Error al actualizar atención') });
  }
}

router.patch('/attendances/:id', requireAuth, updateAttendanceHandler);
router.put('/attendances/:id', requireAuth, updateAttendanceHandler);

router.delete('/attendances/:id', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Atención no encontrada' });
    assertDoctorAccess(user, existing.doctorId);

    if (!canBypassClosedDay(user.role)) {
      await assertDayOpen(existing.doctorId, existing.attendanceDate);
    }
    await ensurePrescriptionTables();

    const result = await prisma.$transaction(async (tx) => {
      await tx.attendance.delete({ where: { id: existing.id } });
      let restoredAppointment = false;
      if (existing.appointmentId) {
        const remaining = await tx.attendance.count({ where: { appointmentId: existing.appointmentId } });
        if (remaining === 0) {
          await tx.appointment.update({
            where: { id: existing.appointmentId },
            data: { operationalStatus: 'PENDING', noShowReason: null, noShowNotes: null },
          });
          restoredAppointment = true;
        }
      }
      const remainingVisit = existing.appointmentId
        ? await tx.attendance.count({ where: { appointmentId: existing.appointmentId } })
        : await tx.attendance.count({
            where: {
              appointmentId: null,
              doctorId: existing.doctorId,
              attendanceDate: existing.attendanceDate,
              patientName: existing.patientName,
            },
          });
      if (remainingVisit === 0) {
        await savePrescription(tx, {
          recipe: [],
          appointmentId: existing.appointmentId,
          doctorId: existing.doctorId,
          patientName: existing.patientName,
          attendanceDate: existing.attendanceDate,
          createdById: user.id,
          lookupPatientName: existing.patientName,
        });
      }
      return { restoredAppointment };
    });

    await writeAudit({
      userId: user.id,
      action: 'DELETE_ATTENDANCE',
      entityType: 'attendance',
      entityId: existing.id,
      previousValue: {
        patientName: existing.patientName,
        treatment: existing.treatment,
        amount: existing.amount,
        notes: existing.notes,
        appointmentId: existing.appointmentId,
        doctorId: existing.doctorId,
      },
      newValue: result,
    });

    res.json({ ok: true, ...result });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al borrar atención' });
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
      include: { doctor: true, attendances: { select: { id: true } } },
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
