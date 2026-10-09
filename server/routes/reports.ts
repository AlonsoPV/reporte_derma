import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../db';
import { requireAuth, getUser } from '../middleware/auth';
import { parseDateOnly, resolveDoctorFilter, toNumber, todayInMexico } from '../utils';
import { canSeeAll } from '../../shared/constants';
import { PAYMENT_LABELS, ORIGIN_LABELS, STATUS_LABELS } from '../../shared/constants';

const router = Router();

router.get('/dashboard-admin', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    if (!canSeeAll(user.role)) return res.status(403).json({ error: 'Sin permiso' });

    const dateStr = (req.query.date as string) || todayInMexico();
    const date = parseDateOnly(dateStr);

    const doctors = await prisma.doctor.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });

    const [appointments, attendances, closures] = await Promise.all([
      prisma.appointment.findMany({
        where: { appointmentDate: date },
        include: { attendance: { select: { id: true } } },
      }),
      prisma.attendance.findMany({ where: { attendanceDate: date } }),
      prisma.dailyClosure.findMany({ where: { date } }),
    ]);

    const byDoctor = doctors.map((doctor) => {
      const appts = appointments.filter((a) => a.doctorId === doctor.id);
      const atts = attendances.filter((a) => a.doctorId === doctor.id);
      const amount = atts.reduce((s, a) => s + toNumber(a.amount), 0);
      const attended = atts.length;
      const closure = closures.find((c) => c.doctorId === doctor.id);
      return {
        doctor,
        scheduled: appts.length,
        attended,
        pending: appts.filter((a) => !a.attendance && a.operationalStatus === 'PENDING').length,
        amount,
        ticketAvg: attended ? amount / attended : 0,
        closureStatus: closure?.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
        closureId: closure?.id ?? null,
      };
    });

    const totalAttended = attendances.length;
    const totalAmount = attendances.reduce((s, a) => s + toNumber(a.amount), 0);

    res.json({
      date: dateStr,
      kpis: {
        patientsToday: appointments.length,
        attended: totalAttended,
        pending: appointments.filter((a) => !a.attendance && a.operationalStatus === 'PENDING').length,
        noShow: appointments.filter((a) => a.operationalStatus === 'NO_SHOW').length,
        amount: totalAmount,
        ticketAvg: totalAttended ? totalAmount / totalAttended : 0,
      },
      byDoctor,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en dashboard admin' });
  }
});

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const user = getUser(req);
    const from = (req.query.from as string) || todayInMexico();
    const to = (req.query.to as string) || from;
    const fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);

    const doctorId = resolveDoctorFilter(user, req.query.doctorId as string | undefined);

    const apptWhere: Record<string, unknown> = {
      appointmentDate: { gte: fromDate, lte: toDate },
    };
    const attWhere: Record<string, unknown> = {
      attendanceDate: { gte: fromDate, lte: toDate },
    };
    if (doctorId) {
      apptWhere.doctorId = doctorId;
      attWhere.doctorId = doctorId;
    }
    if (req.query.treatment) attWhere.treatment = { contains: req.query.treatment as string, mode: 'insensitive' };
    if (req.query.paymentMethod) attWhere.paymentMethod = req.query.paymentMethod;
    if (req.query.origin) attWhere.origin = req.query.origin;
    if (req.query.status) apptWhere.operationalStatus = req.query.status;

    const [appointments, attendances] = await Promise.all([
      prisma.appointment.findMany({
        where: apptWhere,
        include: { doctor: true },
      }),
      prisma.attendance.findMany({
        where: attWhere,
        include: { doctor: true, appointment: true },
        orderBy: [{ attendanceDate: 'asc' }, { actualTime: 'asc' }],
      }),
    ]);

    const attendedScheduled = attendances.filter((a) => a.origin === 'SCHEDULED').length;
    const walkIns = attendances.filter((a) => a.origin === 'WALK_IN').length;
    const totalAmount = attendances.reduce((s, a) => s + toNumber(a.amount), 0);
    const attendedTotal = attendances.length;
    const scheduled = appointments.length;
    const noShows = appointments.filter((a) => a.operationalStatus === 'NO_SHOW').length;
    const cancelled = appointments.filter((a) => a.operationalStatus === 'CANCELLED').length;
    const attendanceRate = scheduled
      ? ((appointments.filter((a) => a.operationalStatus === 'ATTENDED').length) / scheduled) * 100
      : 0;

    const byDoctorMap = new Map<string, { name: string; attended: number; amount: number }>();
    const byTreatment = new Map<string, { count: number; amount: number }>();
    const byPayment = new Map<string, number>();
    const byDay = new Map<string, number>();

    for (const a of attendances) {
      const dKey = a.doctorId;
      const dEntry = byDoctorMap.get(dKey) || { name: a.doctor.name, attended: 0, amount: 0 };
      dEntry.attended += 1;
      dEntry.amount += toNumber(a.amount);
      byDoctorMap.set(dKey, dEntry);

      const t = byTreatment.get(a.treatment) || { count: 0, amount: 0 };
      t.count += 1;
      t.amount += toNumber(a.amount);
      byTreatment.set(a.treatment, t);

      byPayment.set(a.paymentMethod, (byPayment.get(a.paymentMethod) || 0) + toNumber(a.amount));

      const day = a.attendanceDate.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }

    res.json({
      filters: { from, to, doctorId },
      summary: {
        scheduled,
        attended: attendedScheduled,
        walkIns,
        noShows,
        cancelled,
        attendanceRate,
        totalAmount,
        ticketAvg: attendedTotal ? totalAmount / attendedTotal : 0,
      },
      byDoctor: Array.from(byDoctorMap.entries()).map(([id, v]) => ({ doctorId: id, ...v })),
      byTreatment: Array.from(byTreatment.entries())
        .map(([treatment, v]) => ({ treatment, ...v }))
        .sort((a, b) => b.count - a.count),
      byPayment: Array.from(byPayment.entries()).map(([method, amount]) => ({
        method,
        label: PAYMENT_LABELS[method as keyof typeof PAYMENT_LABELS] || method,
        amount,
      })),
      byDay: Array.from(byDay.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      detail: attendances.map((a) => ({
        id: a.id,
        date: a.attendanceDate.toISOString().slice(0, 10),
        time: a.actualTime,
        patientName: a.patientName,
        doctor: a.doctor.name,
        treatment: a.treatment,
        amount: toNumber(a.amount),
        paymentMethod: a.paymentMethod,
        paymentLabel: PAYMENT_LABELS[a.paymentMethod],
        origin: a.origin,
        originLabel: ORIGIN_LABELS[a.origin],
        status: a.appointment?.operationalStatus ?? 'ATTENDED',
        statusLabel: STATUS_LABELS[a.appointment?.operationalStatus ?? 'ATTENDED'],
      })),
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al generar reporte' });
  }
});

router.get('/export', requireAuth, async (req, res) => {
  try {
    // Reuse summary endpoint logic via internal call pattern
    const originalUrl = req.url;
    req.url = `/summary?${new URLSearchParams(req.query as Record<string, string>).toString()}`;
    // Manual fetch of same data
    const user = getUser(req);
    const from = (req.query.from as string) || todayInMexico();
    const to = (req.query.to as string) || from;
    const fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);

    const doctorId = resolveDoctorFilter(user, req.query.doctorId as string | undefined);

    const attWhere: Record<string, unknown> = {
      attendanceDate: { gte: fromDate, lte: toDate },
    };
    if (doctorId) attWhere.doctorId = doctorId;
    if (req.query.treatment) attWhere.treatment = { contains: req.query.treatment as string, mode: 'insensitive' };
    if (req.query.paymentMethod) attWhere.paymentMethod = req.query.paymentMethod;
    if (req.query.origin) attWhere.origin = req.query.origin;

    const attendances = await prisma.attendance.findMany({
      where: attWhere,
      include: { doctor: true, appointment: true },
      orderBy: [{ attendanceDate: 'asc' }, { actualTime: 'asc' }],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Atenciones');
    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Hora', key: 'time', width: 10 },
      { header: 'Paciente', key: 'patient', width: 28 },
      { header: 'Doctor', key: 'doctor', width: 28 },
      { header: 'Tratamiento', key: 'treatment', width: 20 },
      { header: 'Monto', key: 'amount', width: 12 },
      { header: 'Origen', key: 'origin', width: 12 },
      { header: 'Estado', key: 'status', width: 14 },
    ];

    for (const a of attendances) {
      sheet.addRow({
        date: a.attendanceDate.toISOString().slice(0, 10),
        time: a.actualTime,
        patient: a.patientName,
        doctor: a.doctor.name,
        treatment: a.treatment,
        amount: toNumber(a.amount),
        origin: ORIGIN_LABELS[a.origin],
        status: STATUS_LABELS[a.appointment?.operationalStatus ?? 'ATTENDED'],
      });
    }

    const summary = workbook.addWorksheet('Resumen');
    const total = attendances.reduce((s, a) => s + toNumber(a.amount), 0);
    summary.addRows([
      ['Periodo', `${from} — ${to}`],
      ['Atenciones', attendances.length],
      ['Ingresos', total],
      ['Ticket promedio', attendances.length ? total / attendances.length : 0],
    ]);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reporte_${from}_${to}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
    void originalUrl;
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error(e);
    res.status(err.status ?? 500).json({ error: err.message || 'Error al exportar Excel' });
  }
});

export default router;
