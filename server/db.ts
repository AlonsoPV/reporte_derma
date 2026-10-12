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
