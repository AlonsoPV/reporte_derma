import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { prismaAdmin } from '../db';
import { loginSchema } from '../../shared/schemas';
import {
  requireAuth,
  getUser,
  loginKey,
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  clearSessionCookie,
} from '../middleware/auth';
import { writeAudit } from '../utils';
import { runWithAuthScope } from '../rls';
import type { SessionUser } from '../../shared/types';

const router = Router();
const DUMMY_HASH = '$2b$10$PKYqyr.mQy/fN.Uznsg8kewq4lEPyL3.VO4fNTotB9/7uA2K/DHtK';

function saveSession(req: Request, user: SessionUser) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((regenErr) => {
      if (regenErr) return reject(regenErr);
      req.session.user = user;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

async function withAdminRls<T>(fn: (tx: typeof prismaAdmin) => Promise<T>) {
  return prismaAdmin.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT
        set_config('app.role', 'ADMIN', true),
        set_config('app.doctor_id', '', true),
        set_config('app.user_id', 'system', true),
        set_config('app.scope', 'app', true),
        set_config('app.auth_email', '', true),
        set_config('app.auth_doctor_id', '', true)
    `;
    return fn(tx as unknown as typeof prismaAdmin);
  });
}

router.get('/doctors', async (_req, res) => {
  try {
    // Public login directory (id/name only). Uses admin DB tx so the join to users
    // is not blocked by the narrowed anonymous/auth RLS scope.
    const doctors = await withAdminRls((tx) =>
      tx.doctor.findMany({
        where: {
          active: true,
          user: { is: { status: 'ACTIVE', role: 'DOCTOR' } },
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      }),
    );
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
    const identity = doctorId || email || '';
    const key = loginKey(req, identity);
    assertLoginAllowed(key);

    const user = await prismaAdmin.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT
          set_config('app.role', '', true),
          set_config('app.doctor_id', '', true),
          set_config('app.user_id', '', true),
          set_config('app.scope', 'auth', true),
          set_config('app.auth_email', ${email?.toLowerCase() || ''}, true),
          set_config('app.auth_doctor_id', ${doctorId || ''}, true)
      `;
      return doctorId
        ? tx.user.findFirst({
            where: {
              doctorId,
              role: 'DOCTOR',
              status: 'ACTIVE',
              doctor: { is: { active: true } },
            },
            include: { doctor: true },
          })
        : tx.user.findFirst({
            where: { email: email!.toLowerCase(), status: 'ACTIVE' },
            include: { doctor: true },
          });
    });

    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) {
      recordLoginFailure(key);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    if (doctorId && user.role !== 'DOCTOR') {
      recordLoginFailure(key);
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
    await saveSession(req, sessionUser);
    clearLoginFailures(key);

    await runWithAuthScope(
      () =>
        writeAudit({
          userId: user.id,
          action: 'LOGIN',
          entityType: 'user',
          entityId: user.id,
        }),
      { email: user.email, doctorId: user.doctorId || undefined },
    );

    return res.json({ user: sessionUser });
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 429) return res.status(429).json({ error: (e as Error).message });
    console.error(e);
    return res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  const user = getUser(req);
  try {
    await writeAudit({
      userId: user.id,
      action: 'LOGOUT',
      entityType: 'user',
      entityId: user.id,
    });
  } catch (e) {
    console.error(e);
  }
  req.session.destroy(() => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
  return res.json({ user: req.session.user });
});

export default router;
