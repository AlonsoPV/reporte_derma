import type { Request, Response, NextFunction } from 'express';
import type { SessionUser } from '../../shared/types';
import { isReadOnlyRole } from '../../shared/constants';
import { prisma } from '../db';
import { bindRlsContext, rlsContext, rlsContextFromUser } from '../rls';

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
}

const isProd = process.env.NODE_ENV === 'production';
const SESSION_REFRESH_MS = 30_000;
const sessionRefreshAt = new Map<string, number>();

export function rlsContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  bindRlsContext(rlsContextFromUser(req.session?.user));
  next();
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'strict' : 'lax') as 'strict' | 'lax',
    maxAge: 1000 * 60 * 60 * 12,
    path: '/',
  };
}

export function clearSessionCookie(res: Response) {
  res.clearCookie('dermaops.sid', {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
  });
}

function allowedOrigins(): string[] {
  const fromEnv = (process.env.APP_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  if (isProd) return [];
  return [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5050',
    'http://127.0.0.1:5050',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ];
}

function originAllowed(candidate: string, req: Request, allowed: string[]) {
  if (allowed.includes(candidate)) return true;
  const host = req.get('Host');
  if (!host) return false;
  try {
    return new URL(candidate).host === host;
  } catch {
    return false;
  }
}

export function csrfOriginCheck(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const allowed = allowedOrigins();
  const origin = req.get('Origin');
  if (origin) {
    if (originAllowed(origin, req, allowed)) return next();
    return res.status(403).json({ error: 'Origen no permitido' });
  }

  const referer = req.get('Referer');
  if (referer) {
    try {
      const url = new URL(referer);
      const base = `${url.protocol}//${url.host}`;
      if (originAllowed(base, req, allowed)) return next();
    } catch {
      return res.status(403).json({ error: 'Origen no permitido' });
    }
    return res.status(403).json({ error: 'Origen no permitido' });
  }

  if (isProd) {
    return res.status(403).json({ error: 'Origen requerido' });
  }
  return next();
}

type AttemptBucket = { count: number; resetAt: number };
const loginAttempts = new Map<string, AttemptBucket>();
const apiAttempts = new Map<string, AttemptBucket>();

function hitLimit(store: Map<string, AttemptBucket>, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  store.set(key, current);
  return current.count > max;
}

export function loginKey(req: Request, identity: string) {
  return `${req.ip || 'unknown'}|${identity.toLowerCase()}`;
}

export function assertLoginAllowed(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt < now) {
    loginAttempts.set(key, { count: 0, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  if (current.count >= 8) {
    const err = new Error('Demasiados intentos. Espera 15 minutos.');
    (err as Error & { status: number }).status = 429;
    throw err;
  }
}

export function recordLoginFailure(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  current.count += 1;
  loginAttempts.set(key, current);
}

export function clearLoginFailures(key: string) {
  loginAttempts.delete(key);
}

export function apiAbuseGuard(req: Request, res: Response, next: NextFunction) {
  const key = `${req.ip || 'unknown'}|${req.method}|${req.path}`;
  const heavy =
    req.path.includes('/export') ||
    req.path.includes('/imports') ||
    req.path.includes('/auth/doctors') ||
    req.path.includes('/auth/login');
  const max = heavy ? 60 : 300;
  if (hitLimit(apiAttempts, key, max, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta más tarde.' });
  }
  return next();
}

async function refreshSessionUser(req: Request): Promise<SessionUser | null> {
  const current = req.session.user;
  if (!current) return null;
  const sid = req.sessionID || current.id;
  const now = Date.now();
  const last = sessionRefreshAt.get(sid) || 0;
  if (now - last < SESSION_REFRESH_MS) return current;

  const dbUser = await prisma.user.findUnique({
    where: { id: current.id },
    include: { doctor: { select: { name: true, active: true } } },
  });
  sessionRefreshAt.set(sid, now);

  if (!dbUser || dbUser.status !== 'ACTIVE') return null;
  if (dbUser.role === 'DOCTOR' && (!dbUser.doctorId || !dbUser.doctor?.active)) return null;

  const nextUser: SessionUser = {
    id: dbUser.id,
    name: dbUser.doctor?.name || dbUser.name,
    email: dbUser.email,
    role: dbUser.role,
    doctorId: dbUser.doctorId,
  };
  req.session.user = nextUser;

  const ctx = rlsContext();
  if (ctx) {
    ctx.role = nextUser.role;
    ctx.doctorId = nextUser.doctorId ?? '';
    ctx.userId = nextUser.id;
    ctx.scope = 'app';
  }
  return nextUser;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const user = await refreshSessionUser(req);
    if (!user) {
      return req.session.destroy(() => {
        clearSessionCookie(res);
        res.status(401).json({ error: 'Sesión inválida' });
      });
    }
    return next();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error de autenticación' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: 'Sin permiso' });
    }
    next();
  };
}

export function rejectWritesIfReadOnly(req: Request, res: Response, next: NextFunction) {
  const user = req.session.user;
  if (!user || !isReadOnlyRole(user.role)) return next();
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (req.path === '/auth/logout' || req.path.endsWith('/logout')) return next();
  return res.status(403).json({ error: 'Esta cuenta es solo consulta. No se permiten cambios.' });
}

export function getUser(req: Request): SessionUser {
  if (!req.session.user) {
    throw Object.assign(new Error('No autenticado'), { status: 401 });
  }
  return req.session.user;
}
