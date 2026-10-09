import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import { prisma } from '../db';
import { requireAuth, requireRole, getUser } from '../middleware/auth';
import { EXPECTED_EXCEL_COLUMNS } from '../../shared/constants';
import { normalizeMatchKey } from '../../shared/match';
import { parseDateOnly, writeAudit, formatDateOnly } from '../utils';
import type { OperationalStatus } from '@prisma/client';

const router = Router();

const uploadDir = path.join(process.cwd(), 'uploads', 'imports');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.includes('sheet') ||
      file.mimetype.includes('excel') ||
      file.originalname.match(/\.(xlsx|xls)$/i);
    cb(null, !!ok);
  },
});

type ParsedRow = {
  rowNumber: number;
  externalAppointmentId: string;
  appointmentDate: Date | null;
  startTime: string;
  endTime: string;
  duration: string;
  patientName: string;
  phone: string;
  insurance: string;
  birthDate: Date | null;
  email: string;
  sourceStatus: string;
  attendanceConfirmation: string;
  tags: string;
  notes: string;
  calendar: string;
  sourceDoctorName: string;
  doctorId: string | null;
  error?: string;
};

function cell(row: Record<string, unknown>, key: string): string {
  const val = row[key];
  if (val == null || val === '') return '';
  if (val instanceof Date) return val.toISOString();
  return String(val).trim();
}

function parseExcelDate(value: string): Date | null {
  if (!value) return null;
  // Excel serial number
  if (/^\d+(\.\d+)?$/.test(value)) {
    const serial = Number(value);
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = Math.round(serial * 86400000);
    const d = new Date(excelEpoch.getTime() + ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  // DD/MM/YYYY or YYYY-MM-DD
  const dmY = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmY) {
    return new Date(Date.UTC(Number(dmY[3]), Number(dmY[2]) - 1, Number(dmY[1])));
  }
  const ymd = value.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    return new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }
  return null;
}

function parseTime(value: string): string {
  if (!value) return '';
  if (/^\d+(\.\d+)?$/.test(value)) {
    const fraction = Number(value) % 1;
    const totalMinutes = Math.round(fraction * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  return value;
}

function mapOperationalFromSource(sourceStatus: string): OperationalStatus {
  const s = sourceStatus.toLowerCase();
  if (s.includes('cancel')) return 'CANCELLED';
  if (s.includes('reagend')) return 'RESCHEDULED';
  return 'PENDING';
}

async function parseWorkbook(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const headers = rawRows.length
    ? Object.keys(rawRows[0])
    : ((XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[]) || []);

  const missingColumns = EXPECTED_EXCEL_COLUMNS.filter(
    (col) => !headers.some((h) => h.trim().toLowerCase() === col.toLowerCase())
  );

  const mappings = await prisma.doctorNameMapping.findMany();
  const mapByName = new Map(mappings.map((m) => [normalizeMatchKey(m.excelName), m.doctorId]));

  const doctors = await prisma.doctor.findMany();
  for (const d of doctors) {
    mapByName.set(normalizeMatchKey(d.name), d.id);
  }

  const errors: Array<{ row: number; message: string }> = [];
  const parsed: ParsedRow[] = [];
  const doctorsDetected = new Set<string>();
  const unmappedDoctors = new Set<string>();

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const externalAppointmentId = cell(row, 'ID cita');
    const patientName = cell(row, 'Nombre');
    const sourceDoctorName = cell(row, 'Doctor');
    const fecha = cell(row, 'Fecha');

    if (!externalAppointmentId && !patientName) return;

    if (!externalAppointmentId) {
      errors.push({ row: rowNumber, message: 'Falta ID cita' });
      return;
    }
    if (!patientName) {
      errors.push({ row: rowNumber, message: 'Falta Nombre' });
      return;
    }

    const appointmentDate = parseExcelDate(fecha);
    if (!appointmentDate) {
      errors.push({ row: rowNumber, message: `Fecha inválida: ${fecha}` });
    }

    if (sourceDoctorName) doctorsDetected.add(sourceDoctorName);
    const doctorId = sourceDoctorName
      ? mapByName.get(normalizeMatchKey(sourceDoctorName)) ?? null
      : null;
    if (sourceDoctorName && !doctorId) unmappedDoctors.add(sourceDoctorName);

    parsed.push({
      rowNumber,
      externalAppointmentId,
      appointmentDate,
      startTime: parseTime(cell(row, 'Inicio')),
      endTime: parseTime(cell(row, 'Fin')),
      duration: cell(row, 'Duración'),
      patientName,
      phone: cell(row, 'Teléfono'),
      insurance: cell(row, 'Seguro'),
      birthDate: parseExcelDate(cell(row, 'Fecha de Nacimiento')),
      email: cell(row, 'Correo'),
      sourceStatus: cell(row, 'Estado'),
      attendanceConfirmation: cell(row, 'Asistencia'),
      tags: cell(row, 'Etiquetas'),
      notes: cell(row, 'Notas'),
      calendar: cell(row, 'Calendario'),
      sourceDoctorName,
      doctorId,
      error: appointmentDate ? undefined : 'Fecha inválida',
    });
  });

  const ids = parsed.map((p) => p.externalAppointmentId);
  const existing = await prisma.appointment.findMany({
    where: { externalAppointmentId: { in: ids } },
  });
  const existingMap = new Map(existing.map((e) => [e.externalAppointmentId, e]));

  let newCount = 0;
  let existingCount = 0;
  let updatedCount = 0;
  let cancelledCount = 0;

  for (const row of parsed) {
    if (row.error) continue;
    const prev = existingMap.get(row.externalAppointmentId);
    if (!prev) {
      newCount++;
      if (mapOperationalFromSource(row.sourceStatus) === 'CANCELLED') cancelledCount++;
    } else {
      existingCount++;
      const changed =
        prev.patientName !== row.patientName ||
        prev.startTime !== row.startTime ||
        prev.sourceStatus !== row.sourceStatus ||
        prev.phone !== (row.phone || null) ||
        prev.notes !== (row.notes || null) ||
        prev.doctorId !== row.doctorId ||
        formatDateOnly(prev.appointmentDate) !==
          (row.appointmentDate ? formatDateOnly(row.appointmentDate) : '');
      if (changed) updatedCount++;
      if (
        mapOperationalFromSource(row.sourceStatus) === 'CANCELLED' &&
        prev.operationalStatus !== 'CANCELLED' &&
        prev.operationalStatus !== 'ATTENDED'
      ) {
        cancelledCount++;
      }
    }
  }

  return {
    missingColumns,
    rowsDetected: parsed.length,
    newCount,
    existingCount,
    updatedCount,
    cancelledCount,
    errorCount: errors.length + parsed.filter((p) => p.error).length,
    doctorsDetected: Array.from(doctorsDetected),
    unmappedDoctors: Array.from(unmappedDoctors),
    errors: [
      ...errors,
      ...parsed.filter((p) => p.error).map((p) => ({ row: p.rowNumber, message: p.error! })),
    ],
    rows: parsed,
  };
}

router.post('/preview', requireAuth, requireRole('ADMIN'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const user = getUser(req);
    const summary = await parseWorkbook(req.file.path);

    if (summary.missingColumns.length > 0) {
      return res.status(400).json({
        error: 'El Excel no tiene las columnas esperadas',
        missingColumns: summary.missingColumns,
      });
    }

    const batch = await prisma.importBatch.create({
      data: {
        filename: req.file.originalname,
        uploadedById: user.id,
        rowsDetected: summary.rowsDetected,
        createdCount: summary.newCount,
        updatedCount: summary.updatedCount,
        cancelledCount: summary.cancelledCount,
        errorCount: summary.errorCount,
        doctorsDetected: summary.doctorsDetected,
        errors: summary.errors,
        previewData: {
          filePath: req.file.path,
          unmappedDoctors: summary.unmappedDoctors,
          rows: summary.rows.map((r) => ({
            ...r,
            appointmentDate: r.appointmentDate ? formatDateOnly(r.appointmentDate) : null,
            birthDate: r.birthDate ? formatDateOnly(r.birthDate) : null,
          })),
        },
        confirmed: false,
      },
    });

    res.json({
      importId: batch.id,
      filename: batch.filename,
      summary: {
        rowsDetected: summary.rowsDetected,
        newCount: summary.newCount,
        existingCount: summary.existingCount,
        updatedCount: summary.updatedCount,
        cancelledCount: summary.cancelledCount,
        errorCount: summary.errorCount,
        doctorsDetected: summary.doctorsDetected,
        unmappedDoctors: summary.unmappedDoctors,
        errors: summary.errors,
        missingColumns: summary.missingColumns,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al procesar el Excel' });
  }
});

router.post('/confirm/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const user = getUser(req);
    const batch = await prisma.importBatch.findUnique({ where: { id: req.params.id } });
    if (!batch) return res.status(404).json({ error: 'Importación no encontrada' });
    if (batch.confirmed) return res.status(400).json({ error: 'Esta importación ya fue confirmada' });

    const preview = batch.previewData as {
      filePath: string;
      rows: Array<{
        externalAppointmentId: string;
        appointmentDate: string | null;
        startTime: string;
        endTime: string;
        duration: string;
        patientName: string;
        phone: string;
        insurance: string;
        birthDate: string | null;
        email: string;
        sourceStatus: string;
        attendanceConfirmation: string;
        tags: string;
        notes: string;
        calendar: string;
        sourceDoctorName: string;
        doctorId: string | null;
        error?: string;
      }>;
    };

    let createdCount = 0;
    let updatedCount = 0;
    let cancelledCount = 0;
    const applyErrors: Array<{ id: string; message: string }> = [];

    for (const row of preview.rows) {
      if (row.error || !row.appointmentDate) continue;
      try {
        const existing = await prisma.appointment.findUnique({
          where: { externalAppointmentId: row.externalAppointmentId },
        });

        const sourceOp = mapOperationalFromSource(row.sourceStatus);
        const baseData = {
          appointmentDate: parseDateOnly(row.appointmentDate),
          startTime: row.startTime || '00:00',
          endTime: row.endTime || null,
          duration: row.duration || null,
          patientName: row.patientName,
          phone: row.phone || null,
          insurance: row.insurance || null,
          birthDate: row.birthDate ? parseDateOnly(row.birthDate) : null,
          email: row.email || null,
          sourceStatus: row.sourceStatus || null,
          attendanceConfirmation: row.attendanceConfirmation || null,
          tags: row.tags || null,
          notes: row.notes || null,
          calendar: row.calendar || null,
          sourceDoctorName: row.sourceDoctorName || null,
          doctorId: row.doctorId,
          importId: batch.id,
          dataSource: 'IMPORT' as const,
          isDemo: false,
        };

        if (!existing) {
          await prisma.appointment.create({
            data: {
              externalAppointmentId: row.externalAppointmentId,
              ...baseData,
              operationalStatus: 'PENDING',
            },
          });
          createdCount++;
          if (sourceOp === 'CANCELLED') cancelledCount++;
        } else {
          const closed = existing.doctorId
            ? await prisma.dailyClosure.findUnique({
                where: {
                  doctorId_date: { doctorId: existing.doctorId, date: existing.appointmentDate },
                },
              })
            : null;
          if (closed?.status === 'CLOSED') continue;

          const doctorConfirmed =
            existing.operationalStatus === 'ATTENDED' || Boolean(existing.noShowReason);
          const nextStatus = doctorConfirmed ? existing.operationalStatus : 'PENDING';

          if (!doctorConfirmed && sourceOp === 'CANCELLED' && existing.operationalStatus !== 'CANCELLED') {
            cancelledCount++;
          }

          const updated = await prisma.appointment.update({
            where: { id: existing.id },
            data: {
              ...baseData,
              operationalStatus: nextStatus,
            },
          });

          const changed =
            JSON.stringify({
              n: existing.patientName,
              t: existing.startTime,
              s: existing.sourceStatus,
              p: existing.phone,
            }) !==
            JSON.stringify({
              n: updated.patientName,
              t: updated.startTime,
              s: updated.sourceStatus,
              p: updated.phone,
            });

          if (changed) {
            updatedCount++;
            await writeAudit({
              userId: user.id,
              action: 'IMPORT_UPDATE',
              entityType: 'appointment',
              entityId: existing.id,
              previousValue: existing,
              newValue: updated,
            });
          }
        }
      } catch (err) {
        applyErrors.push({
          id: row.externalAppointmentId,
          message: err instanceof Error ? err.message : 'Error',
        });
      }
    }

    const confirmed = await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        confirmed: true,
        createdCount,
        updatedCount,
        cancelledCount,
        errorCount: applyErrors.length,
        errors: applyErrors.length ? applyErrors : batch.errors || undefined,
      },
    });

    await writeAudit({
      userId: user.id,
      action: 'IMPORT_CONFIRM',
      entityType: 'import',
      entityId: batch.id,
      newValue: { createdCount, updatedCount, cancelledCount, errorCount: applyErrors.length },
    });

    // cleanup temp file
    if (preview.filePath && fs.existsSync(preview.filePath)) {
      try {
        fs.unlinkSync(preview.filePath);
      } catch {
        /* ignore */
      }
    }

    res.json({ import: confirmed });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al confirmar importación' });
  }
});

router.post('/cancel/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const batch = await prisma.importBatch.findUnique({ where: { id: req.params.id } });
    if (!batch) return res.status(404).json({ error: 'Importación no encontrada' });
    if (batch.confirmed) return res.status(400).json({ error: 'Ya confirmada' });

    const preview = batch.previewData as { filePath?: string } | null;
    if (preview?.filePath && fs.existsSync(preview.filePath)) {
      try {
        fs.unlinkSync(preview.filePath);
      } catch {
        /* ignore */
      }
    }

    await prisma.importBatch.delete({ where: { id: batch.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cancelar importación' });
  }
});

router.get('/', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  try {
    const imports = await prisma.importBatch.findMany({
      include: { uploadedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { uploadedAt: 'desc' },
      take: 100,
    });
    res.json({ imports });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar importaciones' });
  }
});

export default router;
