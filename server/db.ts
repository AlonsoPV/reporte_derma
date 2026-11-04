import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  appDatabaseUrl,
  appRolePassword,
  currentRoleFlags,
  ensureAppDatabaseRole,
  ensureRowLevelSecurity,
  withRlsExtension,
} from './rls';

process.env.TZ = 'America/Mexico_City';

const globalForPrisma = globalThis as unknown as {
  prismaAdmin?: PrismaClient;
  prisma?: ReturnType<typeof withRlsExtension>;
};

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) {
  throw new Error('DATABASE_URL is required');
}

export const prismaAdmin =
  globalForPrisma.prismaAdmin ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

function withConnectionLimit(url: string) {
  const parsed = new URL(url);
  // Single connection so session-level set_config for RLS cannot leak across pooled clients.
  parsed.searchParams.set('connection_limit', '1');
  return parsed.toString();
}

function createAppClient(url: string) {
  return withRlsExtension(
    new PrismaClient({
      datasources: { db: { url: withConnectionLimit(url) } },
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    }),
  );
}

export let prisma = globalForPrisma.prisma ?? createAppClient(adminUrl);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaAdmin = prismaAdmin;
  globalForPrisma.prisma = prisma;
}

/** One appointment can have several attendance rows. Older DBs still have the unique index. */
export async function ensureMultiAttendances() {
  await prismaAdmin.$executeRawUnsafe(
    'ALTER TABLE "attendances" DROP CONSTRAINT IF EXISTS "attendances_appointmentId_key"',
  );
  await prismaAdmin.$executeRawUnsafe('DROP INDEX IF EXISTS "attendances_appointmentId_key"');
  await prismaAdmin.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "attendances_appointmentId_idx" ON "attendances"("appointmentId")',
  );
}

/** Published databases are not migrated with db push. Create the recipe tables if they are missing. */
export async function ensurePrescriptionTables() {
  await prismaAdmin.$executeRawUnsafe(`
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
  await prismaAdmin.$executeRawUnsafe(`
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
  await prismaAdmin.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "prescriptions_appointmentId_key" ON "prescriptions"("appointmentId")',
  );
  await prismaAdmin.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "prescriptions_attendanceDate_doctorId_idx" ON "prescriptions"("attendanceDate", "doctorId")',
  );
  await prismaAdmin.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "prescription_items_prescriptionId_idx" ON "prescription_items"("prescriptionId")',
  );
}

export async function connectAppDatabase() {
  const password = appRolePassword();
  const role = await ensureAppDatabaseRole(prismaAdmin, password);
  await ensureRowLevelSecurity(prismaAdmin);
  const flags = await currentRoleFlags(prismaAdmin);
  const useAppRole = role.created;
  const url = useAppRole ? appDatabaseUrl(adminUrl, password) : adminUrl;
  if (useAppRole) {
    const previous = prisma;
    const next = createAppClient(url);
    prisma = next;
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = next;
    await prisma.$connect();
    if (previous !== next) await previous.$disconnect().catch(() => undefined);
  }
  if (process.env.NODE_ENV === 'production' && (flags.rolsuper || flags.rolbypassrls) && !useAppRole) {
    throw new Error('RLS requiere un rol de aplicación sin BYPASSRLS. No se inició.');
  }
  return { usingAppRole: useAppRole, adminRole: flags.rolname };
}
