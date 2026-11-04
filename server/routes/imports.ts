import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { prisma } from '../db';
import { requireAuth, requireRole, getUser } from '../middleware/auth';
import { EXPECTED_EXCEL_COLUMNS } from '../../shared/constants';
import { huliRowValue, huliText, mapHuliEstado, parseHuliDate } from '../../shared/huli';
import { matchDoctorId, normalizeMatchKey } from '../../shared/match';
import { toTime24h } from '../../shared/time';
import { parseDateOnly, writeAudit, formatDateOnly } from '../utils';
import type { OperationalStatus } from '@prisma/client';

const router = Router();

const uploadDir = path.join(process.cwd(), 'uploads', 'imports');
fs.mkdirSync(uploadDir, { recursive: true });
const MAX_IMPORT_ROWS = 5000;

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.includes('sheet') ||
      file.mimetype.includes('excel') ||
      file.originalname.match(/\.xlsx$/i);
    cb(null, !!ok);
  },
});

function unlinkQuiet(filePath?: string | null) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object' && 'result' in value) return (value as { result: unknown }).result ?? '';
  if (typeof value === 'object' && 'text' in value) return (value as { text: string }).text;
  if (typeof value === 'object' && 'richText' in value) {
    return ((value as { richText: Array<{ text: string }> }).richText || []).map((p) => p.text).join('');
  }
  return value;
}

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
  const val = huliRowValue(row, key);
  if (val instanceof Date) return val.toISOString();
  return huliText(val);
}

function parseExcelDate(value: unknown): Date | null {
  return parseHuliDate(value);
}

function parseTime(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    const excelEpoch = value.getUTCFullYear() <= 1900;
    const h = excelEpoch ? value.getUTCHours() : value.getHours();
    const m = excelEpoch ? value.getUTCMinutes() : value.getMinutes();
    return toTime24h(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return toTime24h(String(value).trim());
}

function mapOperationalFromSource(sourceStatus: string): OperationalStatus {
  return mapHuliEstado(sourceStatus);
}

async function parseWorkbook(filePath: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      missingColumns: [...EXPECTED_EXCEL_COLUMNS],
      rowsDetected: 0,
      newCount: 0,
      existingCount: 0,
      updatedCount: 0,
      cancelledCount: 0,
      errorCount: 1,
      doctorsDetected: [] as string[],
      unmappedDoctors: [] as string[],
      dateCounts: {} as Record<string, number>,
      errors: [{ row: 0, message: 'El archivo no tiene hojas' }],
      rows: [] as ParsedRow[],
    };
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cellValue(cell) ?? '')
      .trim();
  });

  const rawRows: Record<string, unknown>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rawRows.length >= MAX_IMPORT_ROWS) return;
    const obj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      obj[header] = cellValue(row.getCell(index + 1));
    });
    rawRows.push(obj);
  });

  const missingColumns = EXPECTED_EXCEL_COLUMNS.filter(
    (col) => !headers.some((h) => (h || '').trim().toLowerCase() === col.toLowerCase()),
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
    const fecha = huliRowValue(row, 'Fecha');

    if (!externalAppointmentId && !patientName) return;

    if (!externalAppointmentId) {
      errors.push({ row: rowNumber, message: 'Falta ID cita' });
      return;
    }

    const appointmentDate = parseExcelDate(fecha);
    if (!appointmentDate) {
      errors.push({ row: rowNumber, message: `Fecha inválida: ${huliText(fecha) || String(fecha ?? '')}` });
    }

    if (sourceDoctorName) doctorsDetected.add(sourceDoctorName);
    const doctorId = sourceDoctorName
      ? matchDoctorId(sourceDoctorName, doctors, mapByName)
      : null;
    if (sourceDoctorName && !doctorId) unmappedDoctors.add(sourceDoctorName);

    parsed.push({
      rowNumber,
      externalAppointmentId,
      appointmentDate,
      startTime: parseTime(huliRowValue(row, 'Inicio')),
      endTime: parseTime(huliRowValue(row, 'Fin')),
      duration: cell(row, 'Duración'),
      patientName,
      phone: cell(row, 'Teléfono'),
      insurance: cell(row, 'Seguro'),
      birthDate: parseExcelDate(huliRowValue(row, 'Fecha de Nacimiento')),
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
  const dateCounts: Record<string, number> = {};
  for (const row of parsed) {
    if (!row.appointmentDate) continue;
    const key = formatDateOnly(row.appointmentDate);
    dateCounts[key] = (dateCounts[key] || 0) + 1;
  }

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
    dateCounts,
    errors: [
      ...errors,
      ...parsed.filter((p) => p.error).map((p) => ({ row: p.rowNumber, message: p.error! })),
    ],
    rows: parsed,
  };
}

router.post('/preview', requireAuth, requireRole('ADMIN'), upload.single('file'), async (req, res) => {
  const tempPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const user = getUser(req);
    const summary = await parseWorkbook(req.file.path);

    if (summary.missingColumns.length > 0) {
      unlinkQuiet(tempPath);
      return res.status(400).json({
        error: 'El Excel no tiene las columnas esperadas',
        missingColumns: summary.missingColumns,
      });
    }

    const batch = await prisma.importBatch.create({
      data: {
        filename: path.basename(req.file.originalname).slice(0, 200),
        uploadedById: user.id,
        rowsDetected: summary.rowsDetected,
        createdCount: summary.newCount,
        updatedCount: summary.updatedCount,
        cancelledCount: summary.cancelledCount,
        errorCount: summary.errorCount,
        doctorsDetected: summary.doctorsDetected,
        errors: summary.errors,
        previewData: {
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

    unlinkQuiet(tempPath);

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
        dateCounts: summary.dateCounts,
        errors: summary.errors,
        missingColumns: summary.missingColumns,
      },
    });
  } catch (e) {
    unlinkQuiet(tempPath);
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
    } | null;
    if (!preview?.rows?.length) {
      return res.status(400).json({ error: 'Vista previa inválida o vacía' });
    }

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
              operationalStatus: sourceOp,
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
          const nextStatus = doctorConfirmed ? existing.operationalStatus : sourceOp;

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
