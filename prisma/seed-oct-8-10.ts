import { PrismaClient, PaymentMethod, OperationalStatus } from '@prisma/client';

const prisma = new PrismaClient();

const DATES = ['2026-10-08', '2026-10-09', '2026-10-10'];
const FIRST = ['Ana', 'Luis', 'María', 'José', 'Carmen', 'Diego', 'Lucía', 'Pablo', 'Sofía', 'Andrés', 'Valeria', 'Hugo'];
const LAST = ['Ríos', 'Navarro', 'Castro', 'Herrera', 'Molina', 'Ortega', 'Silva', 'Vargas', 'Reyes', 'Cruz', 'Flores', 'Ibarra'];
const TREATMENTS = ['Consulta', 'Botox', 'Láser', 'Peeling', 'Ácido hialurónico', 'Revisión acné'];
const PAYMENTS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];
const TIMES = ['09:00', '09:30', '10:15', '11:00', '12:00', '13:30', '15:00', '16:30'];

function utcDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function main() {
  const doctors = await prisma.doctor.findMany({
    where: { active: true, user: { is: { status: 'ACTIVE', role: 'DOCTOR' } } },
    include: { user: true },
    orderBy: { name: 'asc' },
  });
  if (doctors.length === 0) throw new Error('No hay médicos activos.');

  const dates = DATES.map(utcDate);

  await prisma.attendance.deleteMany({
    where: {
      OR: [
        {
          appointment: {
            OR: DATES.map((iso) => ({ externalAppointmentId: { startsWith: `DUMMY-${iso}-` } })),
          },
        },
        { notes: { startsWith: '[DUMMY]' }, attendanceDate: { in: dates } },
      ],
    },
  });
  await prisma.appointment.deleteMany({
    where: {
      OR: DATES.map((iso) => ({ externalAppointmentId: { startsWith: `DUMMY-${iso}-` } })),
    },
  });

  const plan: OperationalStatus[] = ['PENDING', 'PENDING', 'PENDING', 'PENDING', 'ATTENDED', 'NO_SHOW', 'CANCELLED'];
  let seq = 1;

  for (const [index, doctor] of doctors.entries()) {
    for (const iso of DATES) {
      const date = utcDate(iso);
      for (let i = 0; i < plan.length; i++) {
        const status = plan[i];
        const name = `${FIRST[(seq + i) % FIRST.length]} ${LAST[(seq + index) % LAST.length]}`;
        const phone = `55${String(index).padStart(2, '0')}${iso.slice(8)}${String(i).padStart(2, '0')}${String(seq % 100).padStart(2, '0')}`;
        const start = TIMES[i % TIMES.length];
        const appointment = await prisma.appointment.create({
          data: {
            externalAppointmentId: `DUMMY-${iso}-${index}-${i}`,
            appointmentDate: date,
            startTime: start,
            endTime: start,
            duration: '30',
            patientName: name,
            phone,
            email: `dummy${iso}-${index}-${i}@demo.local`,
            sourceStatus: status === 'CANCELLED' ? 'Cancelada' : 'Agendada',
            attendanceConfirmation: status === 'NO_SHOW' ? 'Sin confirmar' : 'Confirmada',
            notes: '[DUMMY] paciente de prueba',
            calendar: 'DermaMx',
            sourceDoctorName: doctor.name,
            doctorId: doctor.id,
            operationalStatus: status,
            dataSource: 'DEMO',
            isDemo: true,
          },
        });

        if (status === 'ATTENDED') {
          const amount = 800 + ((index + i) % 5) * 400;
          await prisma.attendance.create({
            data: {
              appointmentId: appointment.id,
              doctorId: doctor.id,
              patientName: name,
              phone,
              email: appointment.email,
              scheduledTime: start,
              actualTime: start,
              treatment: TREATMENTS[(index + i) % TREATMENTS.length],
              amount,
              paymentMethod: PAYMENTS[(index + i) % PAYMENTS.length],
              notes: '[DUMMY] atención de cita',
              origin: 'SCHEDULED',
              dataSource: 'DEMO',
              isDemo: true,
              attendanceDate: date,
              createdById: doctor.user!.id,
            },
          });
        }
        seq += 1;
      }

      await prisma.attendance.create({
        data: {
          doctorId: doctor.id,
          patientName: `${FIRST[(seq + 4) % FIRST.length]} ${LAST[(seq + index) % LAST.length]}`,
          phone: `56${String(index).padStart(2, '0')}${iso.slice(8)}99`,
          actualTime: '15:20',
          treatment: TREATMENTS[(index + seq) % TREATMENTS.length],
          amount: 1800 + index * 250,
          paymentMethod: PAYMENTS[index % PAYMENTS.length],
          notes: '[DUMMY] paciente sin cita',
          origin: 'WALK_IN',
          dataSource: 'DEMO',
          isDemo: true,
          attendanceDate: date,
          createdById: doctor.user!.id,
        },
      });
      seq += 1;
      console.log(`${doctor.name} ${iso}: 4 pendientes, 1 atendido, 1 sin cita, 1 no asistió, 1 cancelada`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
