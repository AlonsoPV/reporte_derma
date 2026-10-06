import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { loginSchema } from '../../shared/schemas';
import { requireAuth, getUser } from '../middleware/auth';
import { writeAudit } from '../utils';
import type { SessionUser } from '../../shared/types';

const router = Router();

router.get('/doctors', async (_req, res) => {
  try {
    const doctors = await prisma.doctor.findMany({
      where: {
        active: true,
        user: { is: { status: 'ACTIVE', role: 'DOCTOR' } },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json({ doctors });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar médicos' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const { email, doctorId, password } = parsed.data;
    const user = doctorId
      ? await prisma.user.findFirst({
          where: {
            doctorId,
            role: 'DOCTOR',
            status: 'ACTIVE',
            doctor: { is: { active: true } },
          },
          include: { doctor: true },
        })
      : await prisma.user.findUnique({
          where: { email: email!.toLowerCase() },
          include: { doctor: true },
        });

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    if (doctorId && user.role !== 'DOCTOR') {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    if (user.role === 'DOCTOR' && (!user.doctorId || !user.doctor?.active)) {
      return res.status(403).json({ error: 'Esta cuenta no tiene un médico activo asociado' });
    }

    const sessionUser: SessionUser = {
      id: user.id,
      name: user.doctor?.name || user.name,
      email: user.email,
      role: user.role,
      doctorId: user.doctorId,
    };
    req.session.user = sessionUser;

    await writeAudit({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
    });

    return res.json({ user: sessionUser });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  const user = getUser(req);
  await writeAudit({
    userId: user.id,
    action: 'LOGOUT',
    entityType: 'user',
    entityId: user.id,
  });
  req.session.destroy(() => {
    res.clearCookie('dermaops.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
  return res.json({ user: req.session.user });
});

export default router;
