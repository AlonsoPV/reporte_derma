import { prisma } from '../db';
import type { Prisma } from '@prisma/client';
import { RETAINED_CLINIC_DOCTORS } from '../../shared/constants';

const demo = { OR: [{ isDemo: true }, { dataSource: 'DEMO' as const }] };
const demoEmails = ['admin', 'recepcion', 'ana', 'berenice', 'carlos'].map((name) => `${name}@clinicademo.local`);
export const CLEANUP_CONFIRMATION = 'BORRAR DEMO Y CUENTAS';
export const PATIENT_CLEANUP_CONFIRMATION = 'BORRAR PACIENTES DE PRUEBA';
export type DemoCleanupOptions = {
  patientsOnly?: boolean;
  confirmedAttendanceIds?: string[];
};

/** Recompute the deletion plan inside the same transaction that applies it. */
export async function cleanupDemoData(actorId: string, apply = false, database = prisma, options: DemoCleanupOptions = {}) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext(${'dermaops-demo-2026-10-08'}))`;
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE') {
      throw Object.assign(new Error('Solo un administrador activo puede eliminar información demo.'), { status: 403 });
    }
    const confirmedIds = [...new Set(options.confirmedAttendanceIds || [])];
    if (confirmedIds.length) {
      if (!options.patientsOnly || confirmedIds.length > 100) {
        throw Object.assign(new Error('Las atenciones confirmadas requieren eliminación solo de pacientes, con un máximo de 100.'), { status: 400 });
      }
      const confirmed = await tx.attendance.findMany({ where: { id: { in: confirmedIds } }, select: { id: true } });
      if (confirmed.length !== confirmedIds.length) {
        throw Object.assign(new Error('Una atención seleccionada ya no existe. Revisa la selección; no se eliminaron registros.'), { status: 409 });
      }
    }
    const attendanceFilter: Prisma.AttendanceWhereInput = confirmedIds.length
      ? { OR: [...demo.OR, { id: { in: confirmedIds } }] } : demo;
    const appointments = await tx.appointment.findMany({
      where: demo, select: { id: true, doctorId: true, appointmentDate: true, attendance: { select: { id: true, isDemo: true, dataSource: true } } },
    });
    const attendances = await tx.attendance.findMany({
      where: attendanceFilter, select: { id: true, doctorId: true, attendanceDate: true },
    });
    // An unmarked attendance is not assumed fictitious, even if linked to a demo appointment.
    const appointmentIds = appointments.filter((a) => !a.attendance || a.attendance.isDemo || a.attendance.dataSource === 'DEMO' || confirmedIds.includes(a.attendance.id)).map((a) => a.id);
    const attendanceIds = attendances.map((a) => a.id);
    const pairs = new Map<string, { doctorId: string; date: Date }>();
    for (const a of appointments) {
      if (a.doctorId) pairs.set(`${a.doctorId}|${a.appointmentDate.toISOString()}`, { doctorId: a.doctorId, date: a.appointmentDate });
    }
    for (const a of attendances) {
      pairs.set(`${a.doctorId}|${a.attendanceDate.toISOString()}`, { doctorId: a.doctorId, date: a.attendanceDate });
    }
    const closures = await tx.dailyClosure.findMany({
      where: { OR: [...pairs.values(), { treatmentsSnapshot: { path: ['dummy'], gte: 0 } }] },
      select: { id: true, doctorId: true, date: true },
    });
    const closureIds: string[] = [];
    for (const closure of closures) {
      const realAppointments = await tx.appointment.count({
        where: { doctorId: closure.doctorId, appointmentDate: closure.date, NOT: demo },
      });
      const realAttendances = await tx.attendance.count({
        where: { doctorId: closure.doctorId, attendanceDate: closure.date, NOT: attendanceFilter },
      });
      if (realAppointments === 0 && realAttendances === 0) closureIds.push(closure.id);
    }

    const users = await tx.user.findMany({
      where: { email: { in: demoEmails } },
      select: { id: true, name: true, doctorId: true, role: true, status: true, doctor: { select: { name: true } } },
    });
    const userIds: string[] = [];
    for (const user of users) {
      const explicitlyRetained =
        (user.role === 'ADMIN' && user.name === 'Administrador') ||
        (user.role === 'RECEPTION' && user.name === 'RECEPCIÓN') ||
        (user.role === 'DOCTOR' && RETAINED_CLINIC_DOCTORS.some((name) => name === (user.doctor?.name || user.name)));
      if (options.patientsOnly || explicitlyRetained) continue;
      const ownedAppointments = user.doctorId ? await tx.appointment.count({
        where: { doctorId: user.doctorId, id: { notIn: appointmentIds } },
      }) : 0;
      const ownedAttendances = user.doctorId ? await tx.attendance.count({
        where: { doctorId: user.doctorId, id: { notIn: attendanceIds } },
      }) : 0;
      const remainingAttendances = await tx.attendance.count({
        where: { createdById: user.id, id: { notIn: attendanceIds } },
      });
      const remainingClosures = await tx.dailyClosure.count({
        where: {
          id: { notIn: closureIds },
          OR: [{ closedById: user.id }, { reopenedById: user.id }, ...(user.doctorId ? [{ doctorId: user.doctorId }] : [])],
        },
      });
      const imports = await tx.importBatch.count({ where: { uploadedById: user.id } });
      if (ownedAppointments + ownedAttendances + remainingAttendances + remainingClosures + imports === 0) userIds.push(user.id);
    }
    const admins = await tx.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } });
    let protectedAdmin = false;
    if (admins.every((admin) => userIds.includes(admin.id))) {
      const keepId = admins.find((admin) => admin.id === actorId)?.id || admins[0]?.id;
      const index = keepId ? userIds.indexOf(keepId) : -1;
      if (index >= 0) { userIds.splice(index, 1); protectedAdmin = true; }
    }
    const doctorIds: string[] = [];
    for (const user of users) {
      if (!user.doctorId || !userIds.includes(user.id)) continue;
      const remaining = await Promise.all([
        tx.appointment.count({ where: { doctorId: user.doctorId, id: { notIn: appointmentIds } } }),
        tx.attendance.count({ where: { doctorId: user.doctorId, id: { notIn: attendanceIds } } }),
        tx.dailyClosure.count({ where: { doctorId: user.doctorId, id: { notIn: closureIds } } }),
      ]);
      if (remaining.every((count) => count === 0)) doctorIds.push(user.doctorId);
    }
    const counts = {
      appointments: appointmentIds.length, attendances: attendanceIds.length,
      closures: closureIds.length, users: userIds.length, doctors: doctorIds.length,
    };
    const preserved = {
      demoAppointments: appointments.length - appointmentIds.length,
      mixedClosures: closures.length - closureIds.length,
      demoUsers: users.length - userIds.length, protectedAdmin,
    };
    if (!apply) return { applied: false, counts, preserved, actorDeleted: false };

    await tx.attendance.deleteMany({ where: { id: { in: attendanceIds } } });
    await tx.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    await tx.dailyClosure.deleteMany({ where: { id: { in: closureIds } } });
    if (userIds.length) {
      await tx.session.deleteMany({
        where: { OR: userIds.map((id) => ({ sess: { path: ['user', 'id'], equals: id } })) },
      });
    }
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.doctorNameMapping.deleteMany({ where: { doctorId: { in: doctorIds } } });
    await tx.doctor.deleteMany({ where: { id: { in: doctorIds } } });
    const actorDeleted = userIds.includes(actorId);
    await tx.auditLog.create({
      data: {
        userId: actorDeleted ? null : actorId,
        action: options.patientsOnly ? 'DELETE_DEMO_PATIENTS' : 'DELETE_DEMO_DATA', entityType: 'demo',
        entityId: actorId, newValue: { counts, preserved, confirmedAttendanceIds: confirmedIds },
      },
    });
    return { applied: true, counts, preserved, actorDeleted };
  }, { maxWait: 5000, timeout: 30000, isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel });
}
