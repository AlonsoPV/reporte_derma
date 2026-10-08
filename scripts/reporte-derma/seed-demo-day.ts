import { prisma } from '../../server/db';

const DATE_LABEL = '2026-10-08';
const DATE = new Date(Date.UTC(2026, 9, 8));
const DEMO_PASSWORD_USERS = [
  { email: 'ana@clinicademo.local', code: 'ANA', slots: ['09:00', '10:30', '13:00'], amount: 850 },
  { email: 'berenice@clinicademo.local', code: 'BER', slots: ['09:30', '11:00', '14:00'], amount: 1200 },
  { email: 'carlos@clinicademo.local', code: 'CAR', slots: ['10:00', '12:00', '15:00'], amount: 950 },
] as const;

function endTime(start: string, minutes: number) {
  const [hour, minute] = start.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function main() {
  const todayInMexico = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (todayInMexico !== DATE_LABEL) {
    throw new Error(`Este conjunto solo debe cargarse el ${DATE_LABEL}; la fecha actual en México es ${todayInMexico}.`);
  }

  const users = await prisma.user.findMany({
    where: {
      email: { in: DEMO_PASSWORD_USERS.map(({ email }) => email) },
      role: 'DOCTOR',
      status: 'ACTIVE',
    },
    include: { doctor: true },
  });
  const userByEmail = new Map(users.map((user) => [user.email, user]));
  for (const profile of DEMO_PASSWORD_USERS) {
    const user = userByEmail.get(profile.email);
    if (!user?.doctor?.active) {
      throw new Error(`No existe un perfil médico demo activo para ${profile.email}.`);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    let appointmentsCreated = 0;
    let attendancesCreated = 0;

    for (const profile of DEMO_PASSWORD_USERS) {
      const user = userByEmail.get(profile.email)!;
      const doctor = user.doctor!;
      const schedule = [
        {
          suffix: '01',
          status: 'PENDING' as const,
          time: profile.slots[0],
          duration: 30,
          confirmation: 'Confirmada',
          label: 'Cita pendiente',
        },
        {
          suffix: '02',
          status: 'ATTENDED' as const,
          time: profile.slots[1],
          duration: 45,
          confirmation: 'Confirmada',
          label: 'Consulta atendida',
        },
        {
          suffix: '03',
          status: 'CANCELLED' as const,
          time: profile.slots[2],
          duration: 30,
          confirmation: 'Cancelada',
          label: 'Cita cancelada',
        },
      ];
      let attendedAppointmentId: string | undefined;

      for (const entry of schedule) {
        const externalAppointmentId = `DEMO-${DATE_LABEL.replaceAll('-', '')}-${profile.code}-${entry.suffix}`;
        const existing = await tx.appointment.findUnique({ where: { externalAppointmentId } });
        if (existing) {
          if (
            !existing.isDemo ||
            existing.doctorId !== doctor.id ||
            existing.appointmentDate.getTime() !== DATE.getTime()
          ) {
            throw new Error(`El identificador ${externalAppointmentId} ya pertenece a un registro distinto.`);
          }
          if (entry.status === 'ATTENDED') attendedAppointmentId = existing.id;
          continue;
        }

        const appointment = await tx.appointment.create({
          data: {
            externalAppointmentId,
            appointmentDate: DATE,
            startTime: entry.time,
            endTime: endTime(entry.time, entry.duration),
            duration: String(entry.duration),
            patientName: `Paciente demo ${profile.code} ${entry.suffix}`,
            sourceStatus: entry.status === 'CANCELLED' ? 'Cancelada' : 'Agendada',
            attendanceConfirmation: entry.confirmation,
            notes: `${entry.label}. Registro ficticio, sin datos personales.`,
            calendar: 'Agenda demo',
            sourceDoctorName: doctor.name,
            doctorId: doctor.id,
            operationalStatus: entry.status,
            dataSource: 'DEMO',
            isDemo: true,
          },
        });
        appointmentsCreated += 1;
        if (entry.status === 'ATTENDED') attendedAppointmentId = appointment.id;
      }

      const scheduledPatient = `Paciente demo ${profile.code} 02`;
      const scheduledAttendance = attendedAppointmentId
        ? await tx.attendance.findUnique({ where: { appointmentId: attendedAppointmentId } })
        : null;
      if (scheduledAttendance && !scheduledAttendance.isDemo) {
        throw new Error(`La asistencia programada de ${doctor.name} ya existe y no es demo.`);
      }
      if (!scheduledAttendance && attendedAppointmentId) {
        await tx.attendance.create({
          data: {
            appointmentId: attendedAppointmentId,
            doctorId: doctor.id,
            patientName: scheduledPatient,
            scheduledTime: profile.slots[1],
            actualTime: endTime(profile.slots[1], 5),
            treatment: 'Consulta dermatológica',
            amount: profile.amount,
            paymentMethod: 'CARD',
            notes: 'Atención ficticia para demostración.',
            origin: 'SCHEDULED',
            dataSource: 'DEMO',
            isDemo: true,
            attendanceDate: DATE,
            createdById: user.id,
          },
        });
        attendancesCreated += 1;
      }

      const walkInPatient = `Paciente demo ${profile.code} walk-in`;
      const existingWalkIn = await tx.attendance.findFirst({
        where: {
          doctorId: doctor.id,
          attendanceDate: DATE,
          origin: 'WALK_IN',
          patientName: walkInPatient,
          actualTime: '16:00',
        },
      });
      if (existingWalkIn && !existingWalkIn.isDemo) {
        throw new Error(`El registro walk-in de ${doctor.name} ya existe y no es demo.`);
      }
      if (!existingWalkIn) {
        await tx.attendance.create({
          data: {
            doctorId: doctor.id,
            patientName: walkInPatient,
            actualTime: '16:00',
            treatment: 'Valoración dermatológica',
            amount: 650,
            paymentMethod: 'CASH',
            notes: 'Atención sin cita, registro ficticio para demostración.',
            origin: 'WALK_IN',
            dataSource: 'DEMO',
            isDemo: true,
            attendanceDate: DATE,
            createdById: user.id,
          },
        });
        attendancesCreated += 1;
      }
    }

    return { appointmentsCreated, attendancesCreated };
  });

  console.log(`Datos demo de ${DATE_LABEL} cargados:`, result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
