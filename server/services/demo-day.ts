import { prisma } from '../db';

export const DEMO_DATE = '2026-10-08';
const date = new Date('2026-10-08T00:00:00.000Z');
const profiles = [
  { email: 'ana@clinicademo.local', code: 'ANA', slots: ['09:00', '10:30', '13:00'], amount: 850 },
  { email: 'berenice@clinicademo.local', code: 'BER', slots: ['09:30', '11:00', '14:00'], amount: 1200 },
  { email: 'carlos@clinicademo.local', code: 'CAR', slots: ['10:00', '12:00', '15:00'], amount: 950 },
] as const;

function endTime(start: string, minutes: number) {
  const [hour, minute] = start.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function conflict(message: string): never {
  throw Object.assign(new Error(message), { status: 409 });
}

/** Fixed, additive fixture. No updates, deletes, schema changes, or startup seeding. */
export async function seedDemoDay(actorId?: string, database = prisma) {
  return database.$transaction(async (tx) => {
    // Serialize repeated admin clicks, including requests on different app instances.
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext(${'dermaops-demo-' + DEMO_DATE}))`;
    if (actorId) {
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (!actor || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE') {
        throw Object.assign(new Error('Solo un administrador activo puede cargar datos demo.'), { status: 403 });
      }
    }
    const users = await tx.user.findMany({
      where: { email: { in: profiles.map((p) => p.email) }, role: 'DOCTOR', status: 'ACTIVE' },
      include: { doctor: true },
    });
    const byEmail = new Map(users.map((user) => [user.email, user]));
    for (const profile of profiles) {
      const doctor = byEmail.get(profile.email)?.doctor;
      if (!doctor?.active) conflict(`No existe un perfil médico demo activo para ${profile.code}.`);
      const closure = await tx.dailyClosure.findUnique({ where: { doctorId_date: { doctorId: doctor.id, date } } });
      if (closure?.status === 'CLOSED') conflict(`El día de ${doctor.name} está cerrado. No se cargó ningún registro.`);
    }

    let appointmentsCreated = 0;
    let attendancesCreated = 0;
    const doctors: Array<{ name: string; appointmentsCreated: number; attendancesCreated: number }> = [];
    for (const profile of profiles) {
      const user = byEmail.get(profile.email)!;
      const doctor = user.doctor!;
      const beforeAppointments = appointmentsCreated;
      const beforeAttendances = attendancesCreated;
      let attendedAppointmentId = '';
      const statuses = ['PENDING', 'ATTENDED', 'CANCELLED'] as const;
      for (let index = 0; index < statuses.length; index++) {
        const suffix = String(index + 1).padStart(2, '0');
        const externalAppointmentId = `DEMO-20261008-${profile.code}-${suffix}`;
        const existing = await tx.appointment.findUnique({ where: { externalAppointmentId } });
        if (existing) {
          if (!existing.isDemo || existing.dataSource !== 'DEMO' || existing.doctorId !== doctor.id ||
              existing.appointmentDate.getTime() !== date.getTime()) {
            conflict(`El identificador ${externalAppointmentId} pertenece a otro registro. No se modificó.`);
          }
          if (index === 1) {
            if (existing.operationalStatus !== 'ATTENDED') conflict('Una cita demo fue reclasificada. No se sobrescribirá.');
            attendedAppointmentId = existing.id;
          }
          continue;
        }
        const duration = index === 1 ? 45 : 30;
        const appointment = await tx.appointment.create({
          data: {
            externalAppointmentId, appointmentDate: date, startTime: profile.slots[index],
            endTime: endTime(profile.slots[index], duration), duration: String(duration),
            patientName: `Paciente demo ${profile.code} ${suffix}`,
            sourceStatus: index === 2 ? 'Cancelada' : 'Agendada',
            attendanceConfirmation: index === 2 ? 'Cancelada' : 'Confirmada',
            notes: 'Registro ficticio, sin datos personales.', calendar: 'Agenda demo',
            sourceDoctorName: doctor.name, doctorId: doctor.id,
            operationalStatus: statuses[index], dataSource: 'DEMO', isDemo: true,
          },
        });
        appointmentsCreated++;
        if (index === 1) attendedAppointmentId = appointment.id;
      }

      const scheduled = await tx.attendance.findUnique({ where: { appointmentId: attendedAppointmentId } });
      if (scheduled && (!scheduled.isDemo || scheduled.dataSource !== 'DEMO' ||
          scheduled.doctorId !== doctor.id || scheduled.origin !== 'SCHEDULED' ||
          scheduled.attendanceDate.getTime() !== date.getTime())) {
        conflict(`La asistencia programada de ${doctor.name} pertenece a otro registro.`);
      }
      if (!scheduled) {
        await tx.attendance.create({
          data: {
            appointmentId: attendedAppointmentId, doctorId: doctor.id,
            patientName: `Paciente demo ${profile.code} 02`, scheduledTime: profile.slots[1],
            actualTime: endTime(profile.slots[1], 5), treatment: 'Consulta dermatológica',
            amount: profile.amount, paymentMethod: 'CARD', notes: 'Atención ficticia para demostración.',
            origin: 'SCHEDULED', dataSource: 'DEMO', isDemo: true, attendanceDate: date, createdById: user.id,
          },
        });
        attendancesCreated++;
      }
      const patientName = `Paciente demo ${profile.code} walk-in`;
      const walkIn = await tx.attendance.findFirst({
        where: { doctorId: doctor.id, attendanceDate: date, origin: 'WALK_IN', patientName },
      });
      if (walkIn && (!walkIn.isDemo || walkIn.dataSource !== 'DEMO')) {
        conflict(`La atención sin cita de ${doctor.name} no es demo. No se modificó.`);
      }
      if (!walkIn) {
        await tx.attendance.create({
          data: {
            doctorId: doctor.id, patientName, actualTime: '16:00', treatment: 'Valoración dermatológica',
            amount: 650, paymentMethod: 'CASH', notes: 'Atención sin cita ficticia para demostración.',
            origin: 'WALK_IN', dataSource: 'DEMO', isDemo: true, attendanceDate: date, createdById: user.id,
          },
        });
        attendancesCreated++;
      }
      doctors.push({
        name: doctor.name, appointmentsCreated: appointmentsCreated - beforeAppointments,
        attendancesCreated: attendancesCreated - beforeAttendances,
      });
    }
    const result = { date: DEMO_DATE, appointmentsCreated, attendancesCreated, doctors };
    if (actorId) {
      await tx.auditLog.create({
        data: { userId: actorId, action: 'LOAD_DEMO_DAY', entityType: 'demo', entityId: DEMO_DATE, newValue: result },
      });
    }
    return result;
  }, { maxWait: 5000, timeout: 15000 });
}
