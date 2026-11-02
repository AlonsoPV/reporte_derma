import type { Request, Response, NextFunction } from 'express';
import type { SessionUser } from '../../shared/types';
import { isReadOnlyRole } from '../../shared/constants';
import { enterRlsContext, rlsContextFromUser } from '../rls';

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
}

export function rlsContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  enterRlsContext(rlsContextFromUser(req.session?.user));
  next();
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
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
