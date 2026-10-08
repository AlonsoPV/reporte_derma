import { PrismaClient, PaymentMethod, OperationalStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt;
}

async function main() {
  console.log('Seeding demo data...');

  await prisma.auditLog.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.dailyClosure.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.doctorNameMapping.deleteMany();
  await prisma.user.deleteMany();
  await prisma.doctor.deleteMany();

  const passwordHash = await bcrypt.hash('Demo123!', 10);

  const doctorBerenice = await prisma.doctor.create({
    data: { name: 'Berenice Gomez Tagle Boix' },
  });
  const doctorCarlos = await prisma.doctor.create({
    data: { name: 'Carlos Mendoza Ruiz' },
  });
  const doctorAna = await prisma.doctor.create({
    data: { name: 'Ana Patricia Solís' },
  });

  await prisma.doctorNameMapping.createMany({
    data: [
      { excelName: 'Berenice Gomez Tagle Boix', doctorId: doctorBerenice.id },
      { excelName: 'Carlos Mendoza Ruiz', doctorId: doctorCarlos.id },
      { excelName: 'Ana Patricia Solís', doctorId: doctorAna.id },
    ],
  });

  const admin = await prisma.user.create({
    data: {
      name: 'Administrador Demo',
      email: 'admin@clinicademo.local',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.user.create({
    data: {
      name: 'Recepción Demo',
      email: 'recepcion@clinicademo.local',
      passwordHash,
      role: 'RECEPTION',
      status: 'ACTIVE',
    },
  });

  const userBerenice = await prisma.user.create({
    data: {
      name: 'Dra. Berenice Gomez',
      email: 'berenice@clinicademo.local',
      passwordHash,
      role: 'DOCTOR',
      status: 'ACTIVE',
      doctorId: doctorBerenice.id,
    },
  });

  await prisma.user.create({
    data: {
      name: 'Dr. Carlos Mendoza',
      email: 'carlos@clinicademo.local',
      passwordHash,
      role: 'DOCTOR',
      status: 'ACTIVE',
      doctorId: doctorCarlos.id,
    },
  });

  await prisma.user.create({
    data: {
      name: 'Dra. Ana Solís',
      email: 'ana@clinicademo.local',
      passwordHash,
      role: 'DOCTOR',
      status: 'ACTIVE',
      doctorId: doctorAna.id,
    },
  });

  const today = dateOnly(0);
  const yesterday = dateOnly(-1);

  const appointments = await Promise.all([
    prisma.appointment.create({
      data: {
        externalAppointmentId: 'DEMO-001',
        appointmentDate: today,
        startTime: '09:00',
        endTime: '09:30',
        duration: '30',
        patientName: 'María López',
        phone: '5512345678',
        email: 'maria.lopez@email.com',
        sourceStatus: 'Agendada',
        attendanceConfirmation: 'Confirmada',
        notes: 'Control dermatológico',
        calendar: 'DermaMx',
        sourceDoctorName: 'Berenice Gomez Tagle Boix',
        doctorId: doctorBerenice.id,
        operationalStatus: 'PENDING',
        dataSource: 'DEMO',
        isDemo: true,
      },
    }),
    prisma.appointment.create({
      data: {
        externalAppointmentId: 'DEMO-002',
        appointmentDate: today,
        startTime: '10:00',
        endTime: '10:45',
        duration: '45',
        patientName: 'Juan Pérez',
        phone: '5587654321',
        sourceStatus: 'Agendada',
        attendanceConfirmation: 'Confirmada',
        notes: 'Botox',
        calendar: 'DermaMx',
        sourceDoctorName: 'Berenice Gomez Tagle Boix',
        doctorId: doctorBerenice.id,
        operationalStatus: 'PENDING',
        dataSource: 'DEMO',
        isDemo: true,
      },
    }),
    prisma.appointment.create({
      data: {
        externalAppointmentId: 'DEMO-003',
        appointmentDate: today,
        startTime: '11:30',
        endTime: '12:00',
        duration: '30',
        patientName: 'Laura García',
        phone: '5511223344',
        sourceStatus: 'Agendada',
        attendanceConfirmation: 'Sin confirmar',
        notes: 'Consulta inicial',
        calendar: 'DermaMx',
        sourceDoctorName: 'Berenice Gomez Tagle Boix',
        doctorId: doctorBerenice.id,
        operationalStatus: 'ATTENDED',
        dataSource: 'DEMO',
        isDemo: true,
      },
    }),
    prisma.appointment.create({
      data: {
        externalAppointmentId: 'DEMO-004',
        appointmentDate: today,
        startTime: '12:30',
        endTime: '13:00',
        duration: '30',
        patientName: 'Pedro Sánchez',
        phone: '5599887766',
        sourceStatus: 'Cancelada',
        attendanceConfirmation: 'Confirmada',
        notes: 'Láser',
        calendar: 'DermaMx',
        sourceDoctorName: 'Berenice Gomez Tagle Boix',
        doctorId: doctorBerenice.id,
        operationalStatus: 'CANCELLED',
        dataSource: 'DEMO',
        isDemo: true,
      },
    }),
    prisma.appointment.create({
      data: {
        externalAppointmentId: 'DEMO-005',
        appointmentDate: today,
        startTime: '09:30',
        endTime: '10:00',
        duration: '30',
        patientName: 'Sofía Ramírez',
        phone: '5544556677',
        sourceStatus: 'Agendada',
        attendanceConfirmation: 'Confirmada',
        notes: 'Revisión acné',
        calendar: 'DermaMx',
        sourceDoctorName: 'Carlos Mendoza Ruiz',
        doctorId: doctorCarlos.id,
        operationalStatus: 'PENDING',
        dataSource: 'DEMO',
        isDemo: true,
      },
    }),
    prisma.appointment.create({
      data: {
        externalAppointmentId: 'DEMO-006',
        appointmentDate: today,
        startTime: '11:00',
        endTime: '11:30',
        duration: '30',
        patientName: 'Miguel Torres',
        phone: '5533445566',
        sourceStatus: 'Agendada',
        attendanceConfirmation: 'Confirmada',
        calendar: 'DermaMx',
        sourceDoctorName: 'Ana Patricia Solís',
        doctorId: doctorAna.id,
        operationalStatus: 'PENDING',
        dataSource: 'DEMO',
        isDemo: true,
      },
    }),
    prisma.appointment.create({
      data: {
        externalAppointmentId: 'DEMO-YEST-001',
        appointmentDate: yesterday,
        startTime: '10:00',
        endTime: '10:30',
        duration: '30',
        patientName: 'Elena Vargas',
        phone: '5511112222',
        sourceStatus: 'Agendada',
        attendanceConfirmation: 'Confirmada',
        notes: 'Peeling',
        calendar: 'DermaMx',
        sourceDoctorName: 'Berenice Gomez Tagle Boix',
        doctorId: doctorBerenice.id,
        operationalStatus: 'ATTENDED',
        dataSource: 'DEMO',
        isDemo: true,
      },
    }),
  ]);

  const attendedToday = appointments.find((a) => a.externalAppointmentId === 'DEMO-003')!;
  const attendedYest = appointments.find((a) => a.externalAppointmentId === 'DEMO-YEST-001')!;

  await prisma.attendance.create({
    data: {
      appointmentId: attendedToday.id,
      doctorId: doctorBerenice.id,
      patientName: attendedToday.patientName,
      phone: attendedToday.phone,
      email: attendedToday.email,
      scheduledTime: attendedToday.startTime,
      actualTime: '11:35',
      treatment: 'Consulta',
      amount: 800,
      paymentMethod: PaymentMethod.CASH,
      notes: 'Paciente estable',
      origin: 'SCHEDULED',
      dataSource: 'DEMO',
      isDemo: true,
      attendanceDate: today,
      createdById: userBerenice.id,
    },
  });

  await prisma.attendance.create({
    data: {
      doctorId: doctorBerenice.id,
      patientName: 'Roberto Díaz',
      phone: '5577778888',
      actualTime: '13:15',
      treatment: 'Botox',
      amount: 4500,
      paymentMethod: PaymentMethod.CARD,
      notes: 'Paciente sin cita previa',
      origin: 'WALK_IN',
      dataSource: 'DEMO',
      isDemo: true,
      attendanceDate: today,
      createdById: userBerenice.id,
    },
  });

  await prisma.attendance.create({
    data: {
      appointmentId: attendedYest.id,
      doctorId: doctorBerenice.id,
      patientName: attendedYest.patientName,
      phone: attendedYest.phone,
      scheduledTime: attendedYest.startTime,
      actualTime: '10:05',
      treatment: 'Peeling',
      amount: 1200,
      paymentMethod: PaymentMethod.TRANSFER,
      origin: 'SCHEDULED',
      dataSource: 'DEMO',
      isDemo: true,
      attendanceDate: yesterday,
      createdById: userBerenice.id,
    },
  });

  await prisma.dailyClosure.create({
    data: {
      doctorId: doctorBerenice.id,
      date: yesterday,
      scheduledCount: 1,
      attendedCount: 1,
      walkInCount: 0,
      noShowCount: 0,
      cancelledCount: 0,
      rescheduledCount: 0,
      totalAmount: 1200,
      cashAmount: 0,
      cardAmount: 0,
      transferAmount: 1200,
      otherAmount: 0,
      treatmentsSnapshot: { Peeling: 1 },
      status: 'CLOSED',
      closedById: userBerenice.id,
      closedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'SEED',
      entityType: 'system',
      entityId: null,
      newValue: { message: 'Datos demo cargados' },
    },
  });

  console.log('Seed complete.');
  console.log('Admin: admin@clinicademo.local / Demo123!');
  console.log('Recepción: recepcion@clinicademo.local / Demo123!');
  console.log('Doctor: berenice@clinicademo.local / Demo123!');
  console.log('Doctor: carlos@clinicademo.local / Demo123!');
  console.log('Doctor: ana@clinicademo.local / Demo123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
