import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { loginSchema } from '../../shared/schemas';
import { requireAuth, getUser } from '../middleware/auth';
import { writeAudit } from '../utils';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      doctorId: user.doctorId,
    };

    await writeAudit({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
    });

    return res.json({ user: req.session.user });
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
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
  return res.json({ user: req.session.user });
});

export default router;
