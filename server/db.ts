import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

process.env.TZ = 'America/Mexico_City';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** One appointment can have several attendance rows. Older DBs still have the unique index. */
export async function ensureMultiAttendances() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "attendances" DROP CONSTRAINT IF EXISTS "attendances_appointmentId_key"',
  );
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "attendances_appointmentId_key"');
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "attendances_appointmentId_idx" ON "attendances"("appointmentId")',
  );
}

/** Published databases are not migrated with db push. Create the recipe tables if they are missing. */
export async function ensurePrescriptionTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "prescriptions" (
      "id" TEXT NOT NULL,
      "appointmentId" TEXT,
      "doctorId" TEXT NOT NULL,
      "patientName" TEXT NOT NULL,
      "phone" TEXT,
      "attendanceDate" DATE NOT NULL,
      "createdById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "prescription_items" (
      "id" TEXT NOT NULL,
      "prescriptionId" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL,
      "category" TEXT NOT NULL,
      "productName" TEXT NOT NULL,
      "usage" TEXT NOT NULL,
      "recommendation" TEXT NOT NULL,
      CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "prescriptions_appointmentId_key" ON "prescriptions"("appointmentId")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "prescriptions_attendanceDate_doctorId_idx" ON "prescriptions"("attendanceDate", "doctorId")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "prescription_items_prescriptionId_idx" ON "prescription_items"("prescriptionId")',
  );
}
