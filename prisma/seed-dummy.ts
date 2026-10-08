import { PrismaClient, PaymentMethod, OperationalStatus } from '@prisma/client';

const prisma = new PrismaClient();

function dateOnly(offsetDays = 0): Date {
  const now = new Date();
  const mx = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = mx.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays));
}

const FIRST = ['Ana', 'Luis', 'María', 'José', 'Carmen', 'Diego', 'Lucía', 'Pablo', 'Sofía', 'Andrés', 'Valeria', 'Hugo'];
const LAST = ['Ríos', 'Navarro', 'Castro', 'Herrera', 'Molina', 'Ortega', 'Silva', 'Vargas', 'Reyes', 'Cruz', 'Flores', 'Ibarra'];
const TREATMENTS = ['Consulta', 'Botox', 'Láser', 'Peeling', 'Ácido hialurónico', 'Revisión acné'];
const PAYMENTS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];
const TIMES = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '13:00', '14:30', '16:00'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

async function main() {
  const doctors = await prisma.doctor.findMany({
    where: { active: true, user: { is: { status: 'ACTIVE', role: 'DOCTOR' } } },
    include: { user: true },
    orderBy: { name: 'asc' },
  });
  if (doctors.length === 0) {
    throw new Error('No hay médicos activos. Corre npm run db:seed primero.');
  }

  await prisma.attendance.deleteMany({
    where: { appointment: { externalAppointmentId: { startsWith: 'DUMMY-' } } },
  });
  await prisma.attendance.deleteMany({
    where: { notes: { startsWith: '[DUMMY]' } },
  });
  await prisma.appointment.deleteMany({
    where: { externalAppointmentId: { startsWith: 'DUMMY-' } },
  });

  let seq = 1;
  const summary: string[] = [];

  for (const [index, doctor] of doctors.entries()) {
    const userId = doctor.user!.id;
    const days = [
      { offset: 0, close: false },
      { offset: -1, close: index === 1 },
      { offset: -2, close: index === 2 },
      { offset: -6, close: index === 0 },
      { offset: -10, close: false },
    ];

    for (const day of days) {
      const date = dateOnly(day.offset);
      const stamp = date.toISOString().slice(0, 10);
      let scheduled = 0;
      let attended = 0;
      let walkIns = 0;
      let noShows = 0;
      let cancelled = 0;
      let total = 0;

      const plan: OperationalStatus[] =
        day.offset === 0
          ? ['PENDING', 'PENDING', 'PENDING', 'PENDING', 'ATTENDED', 'NO_SHOW', 'CANCELLED']
          : ['ATTENDED', 'ATTENDED', 'NO_SHOW', 'PENDING'];

      for (let i = 0; i < plan.length; i++) {
        const status = plan[i];
        const name = `${FIRST[(seq + i) % FIRST.length]} ${LAST[(seq + index) % LAST.length]}`;
        const phone = `55${pad(index)}${pad(Math.abs(day.offset))}${pad(i)}${pad(seq % 100)}`;
        const start = TIMES[i % TIMES.length];
        const appointment = await prisma.appointment.create({
          data: {
            externalAppointmentId: `DUMMY-${stamp}-${index}-${i}`,
            appointmentDate: date,
            startTime: start,
            endTime: start,
            duration: '30',
            patientName: name,
            phone,
            email: `dummy${seq}@demo.local`,
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
        scheduled += 1;
        seq += 1;

        if (status === 'ATTENDED') {
          const amount = 700 + (seq % 5) * 350;
          const treatment = TREATMENTS[(seq + index) % TREATMENTS.length];
          await prisma.attendance.create({
            data: {
              appointmentId: appointment.id,
              doctorId: doctor.id,
              patientName: name,
              phone,
              email: appointment.email,
              scheduledTime: start,
              actualTime: start,
              treatment,
              amount,
              paymentMethod: PAYMENTS[seq % PAYMENTS.length],
              notes: '[DUMMY] atención de cita',
              origin: 'SCHEDULED',
              dataSource: 'DEMO',
              isDemo: true,
              attendanceDate: date,
              createdById: userId,
            },
          });
          attended += 1;
          total += amount;
        } else if (status === 'NO_SHOW') {
          noShows += 1;
        } else if (status === 'CANCELLED') {
          cancelled += 1;
        }
      }

      if (day.offset <= 0) {
        const amount = 1500 + index * 400;
        const treatment = TREATMENTS[(index + Math.abs(day.offset)) % TREATMENTS.length];
        await prisma.attendance.create({
          data: {
            doctorId: doctor.id,
            patientName: `${FIRST[(seq + 3) % FIRST.length]} ${LAST[(seq + 5) % LAST.length]}`,
            phone: `56${pad(index)}${pad(Math.abs(day.offset))}${pad(seq % 100)}`,
            actualTime: '15:10',
            treatment,
            amount,
            paymentMethod: PAYMENTS[(index + 1) % PAYMENTS.length],
            notes: '[DUMMY] paciente sin cita',
            origin: 'WALK_IN',
            dataSource: 'DEMO',
            isDemo: true,
            attendanceDate: date,
            createdById: userId,
          },
        });
        walkIns += 1;
        total += amount;
        seq += 1;
      }

      if (day.close) {
        await prisma.dailyClosure.upsert({
          where: { doctorId_date: { doctorId: doctor.id, date } },
          update: {
            status: 'CLOSED',
            scheduledCount: scheduled,
            attendedCount: attended,
            walkInCount: walkIns,
            noShowCount: noShows,
            cancelledCount: cancelled,
            totalAmount: total,
            closedById: userId,
          },
          create: {
            doctorId: doctor.id,
            date,
            scheduledCount: scheduled,
            attendedCount: attended,
            walkInCount: walkIns,
            noShowCount: noShows,
            cancelledCount: cancelled,
            rescheduledCount: 0,
            totalAmount: total,
            cashAmount: 0,
            cardAmount: total,
            transferAmount: 0,
            otherAmount: 0,
            treatmentsSnapshot: { dummy: attended + walkIns },
            status: 'CLOSED',
            closedById: userId,
          },
        });
      }

      summary.push(
        `${doctor.name} ${stamp} citas=${scheduled} atendidos=${attended} sinCita=${walkIns} ${day.close ? 'CERRADO' : 'abierto'}`
      );
    }
  }

  console.log('Pacientes dummy listos.');
  for (const line of summary) console.log(line);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
