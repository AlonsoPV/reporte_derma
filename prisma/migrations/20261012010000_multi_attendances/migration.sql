ALTER TABLE "attendances" DROP CONSTRAINT IF EXISTS "attendances_appointmentId_key";
DROP INDEX IF EXISTS "attendances_appointmentId_key";
CREATE INDEX IF NOT EXISTS "attendances_appointmentId_idx" ON "attendances"("appointmentId");
