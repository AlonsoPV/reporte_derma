import 'dotenv/config';
import { PrismaClient, PaymentMethod } from '@prisma/client';

const prisma = new PrismaClient();
const iso = '2026-10-08';
const date = new Date(Date.UTC(2026, 9, 8));

const TREATMENTS = ['Consulta', 'Botox', 'Láser', 'Peeling', 'Ácido hialurónico'];
const PAYMENTS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];

async function main() {
  const doctors = await prisma.doctor.findMany({
    where: { active: true, user: { is: { status: 'ACTIVE', role: 'DOCTOR' } } },
    include: { user: true },
    orderBy: { name: 'asc' },
  });
  if (doctors.length === 0) throw new Error('No hay médicos activos.');

  await prisma.attendance.deleteMany({
    where: {
      OR: [
        { appointment: { externalAppointmentId: { startsWith: `DUMMY-${iso}-` } } },
        { notes: { startsWith: '[DUMMY]' }, attendanceDate: date },
      ],
    },
  });
  await prisma.appointment.deleteMany({
    where: { externalAppointmentId: { startsWith: `DUMMY-${iso}-` } },
  });
  await prisma.dailyClosure.deleteMany({ where: { date, doctorId: { in: doctors.map((d) => d.id) } } });

  for (const [index, doctor] of doctors.entries()) {
    const short = doctor.name.split(' ')[0];
    const slots = [
      { time: '09:00', status: 'PENDING' as const },
      { time: '09:30', status: 'PENDING' as const },
      { time: '10:00', status: 'PENDING' as const },
      { time: '10:30', status: 'PENDING' as const },
      { time: '11:00', status: 'PENDING' as const },
      { time: '11:30', status: 'ATTENDED' as const },
      { time: '12:00', status: 'ATTENDED' as const },
      { time: '12:30', status: 'NO_SHOW' as const },
      { time: '13:00', status: 'CANCELLED' as const },
    ];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const name = `${short} · ${slot.status === 'PENDING' ? 'Pendiente' : slot.status === 'ATTENDED' ? 'Atendido' : slot.status === 'NO_SHOW' ? 'No asistió' : 'Cancelado'} ${i + 1}`;
      const appointment = await prisma.appointment.create({
        data: {
          externalAppointmentId: `DUMMY-${iso}-${index}-${i}`,
          appointmentDate: date,
          startTime: slot.time,
          endTime: slot.time,
          duration: '30',
          patientName: name,
          phone: `55${String(index + 1)}${String(i + 1).padStart(2, '0')}0810`,
          email: `hoy-${index}-${i}@demo.local`,
          sourceStatus: slot.status === 'CANCELLED' ? 'Cancelada' : 'Agendada',
          attendanceConfirmation: slot.status === 'NO_SHOW' ? 'Sin confirmar' : 'Confirmada',
          notes: '[DUMMY] agenda de hoy',
          calendar: 'DermaMx',
          sourceDoctorName: doctor.name,
          doctorId: doctor.id,
          operationalStatus: slot.status,
          dataSource: 'DEMO',
          isDemo: true,
        },
      });

      if (slot.status === 'ATTENDED') {
        const amount = 900 + i * 350;
        await prisma.attendance.create({
          data: {
            appointmentId: appointment.id,
            doctorId: doctor.id,
            patientName: name,
            phone: appointment.phone,
            scheduledTime: slot.time,
            actualTime: slot.time,
            treatment: TREATMENTS[i % TREATMENTS.length],
            amount,
            paymentMethod: PAYMENTS[i % PAYMENTS.length],
            notes: '[DUMMY] atención de hoy',
            origin: 'SCHEDULED',
            dataSource: 'DEMO',
            isDemo: true,
            attendanceDate: date,
            createdById: doctor.user!.id,
          },
        });
      }
    }

    await prisma.attendance.create({
      data: {
        doctorId: doctor.id,
        patientName: `${short} · Sin cita`,
        phone: `56${String(index + 1)}000810`,
        actualTime: '15:00',
        treatment: 'Consulta',
        amount: 1500 + index * 200,
        paymentMethod: 'CARD',
        notes: '[DUMMY] paciente sin cita de hoy',
        origin: 'WALK_IN',
        dataSource: 'DEMO',
        isDemo: true,
        attendanceDate: date,
        createdById: doctor.user!.id,
      },
    });

    console.log(`${doctor.name}: 5 pendientes, 2 atendidos, 1 sin cita, 1 no asistió, 1 cancelado`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
