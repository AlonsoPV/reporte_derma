import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { requireAuth, requireRole, getUser } from '../middleware/auth';
import { userSchema, doctorSchema, doctorMappingSchema } from '../../shared/schemas';
import { writeAudit } from '../utils';
import { CLEANUP_CONFIRMATION, cleanupDemoData } from '../services/demo-cleanup';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/demo-cleanup', async (req, res) => {
  try {
    res.json(await cleanupDemoData(getUser(req).id));
  } catch (error) {
    res.status((error as Error & { status?: number }).status || 500).json({ error: 'No se pudo revisar la información demo.' });
  }
});

router.post('/demo-cleanup', async (req, res) => {
  if (req.body?.confirmation !== CLEANUP_CONFIRMATION) {
    return res.status(400).json({ error: `Escribe ${CLEANUP_CONFIRMATION} para confirmar la eliminación.` });
  }
  try {
    const result = await cleanupDemoData(getUser(req).id, true);
    res.json(result);
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    res.status(status || 500).json({
      error: status ? (error as Error).message : 'No se pudo completar la eliminación. No se guardaron cambios parciales.',
    });
  }
});

// Users
router.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { doctor: true },
    orderBy: { name: 'asc' },
  });
  res.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      doctorId: u.doctorId,
      doctor: u.doctor,
      createdAt: u.createdAt,
    })),
  });
});

router.post('/users', async (req, res) => {
  try {
    const user = getUser(req);
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }
    if (!parsed.data.password) {
      return res.status(400).json({ error: 'Contraseña requerida' });
    }

    const created = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
        role: parsed.data.role,
        status: parsed.data.status ?? 'ACTIVE',
        doctorId: parsed.data.doctorId || null,
      },
      include: { doctor: true },
    });

    await writeAudit({
      userId: user.id,
      action: 'CREATE_USER',
      entityType: 'user',
      entityId: created.id,
      newValue: { email: created.email, role: created.role },
    });

    res.json({ user: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const actor = getUser(req);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });

    const parsed = userSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name) data.name = parsed.data.name;
    if (parsed.data.email) data.email = parsed.data.email.toLowerCase();
    if (parsed.data.role) data.role = parsed.data.role;
    if (parsed.data.status) data.status = parsed.data.status;
    if (parsed.data.doctorId !== undefined) data.doctorId = parsed.data.doctorId || null;
    if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data,
      include: { doctor: true },
    });

    await writeAudit({
      userId: actor.id,
      action: 'UPDATE_USER',
      entityType: 'user',
      entityId: existing.id,
      previousValue: { email: existing.email, role: existing.role, status: existing.status },
      newValue: { email: updated.email, role: updated.role, status: updated.status },
    });

    res.json({ user: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

router.get('/doctors', async (_req, res) => {
  const doctors = await prisma.doctor.findMany({
    include: { user: true, nameMappings: true },
    orderBy: { name: 'asc' },
  });
  res.json({ doctors });
});

router.post('/doctors', async (req, res) => {
  try {
    const actor = getUser(req);
    const parsed = doctorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }
    const doctor = await prisma.doctor.create({ data: { name: parsed.data.name, active: parsed.data.active ?? true } });
    await writeAudit({
      userId: actor.id,
      action: 'CREATE_DOCTOR',
      entityType: 'doctor',
      entityId: doctor.id,
      newValue: doctor,
    });
    res.json({ doctor });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear doctor' });
  }
});

router.patch('/doctors/:id', async (req, res) => {
  try {
    const actor = getUser(req);
    const existing = await prisma.doctor.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Doctor no encontrado' });
    const updated = await prisma.doctor.update({
      where: { id: existing.id },
      data: {
        name: req.body.name ?? existing.name,
        active: req.body.active ?? existing.active,
      },
    });
    await writeAudit({
      userId: actor.id,
      action: 'UPDATE_DOCTOR',
      entityType: 'doctor',
      entityId: existing.id,
      previousValue: existing,
      newValue: updated,
    });
    res.json({ doctor: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar doctor' });
  }
});

router.get('/mappings', async (_req, res) => {
  const mappings = await prisma.doctorNameMapping.findMany({
    include: { doctor: true },
    orderBy: { excelName: 'asc' },
  });
  res.json({ mappings });
});

router.post('/mappings', async (req, res) => {
  try {
    const actor = getUser(req);
    const parsed = doctorMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }
    const mapping = await prisma.doctorNameMapping.upsert({
      where: { excelName: parsed.data.excelName },
      create: parsed.data,
      update: { doctorId: parsed.data.doctorId },
      include: { doctor: true },
    });
    await writeAudit({
      userId: actor.id,
      action: 'UPSERT_DOCTOR_MAPPING',
      entityType: 'doctor_name_mapping',
      entityId: mapping.id,
      newValue: mapping,
    });
    res.json({ mapping });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar mapeo' });
  }
});

router.get('/audit', async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { timestamp: 'desc' },
    take: Number(req.query.limit) || 200,
  });
  res.json({ logs });
});

export default router;
