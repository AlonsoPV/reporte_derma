import type { Request, Response, NextFunction } from 'express';
import type { SessionUser } from '../shared/types';

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
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
  if (!user || user.role !== 'RECEPTION') return next();
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (req.path === '/auth/logout' || req.path.endsWith('/logout')) return next();
  return res.status(403).json({ error: 'Recepción es solo consulta. No se permiten cambios.' });
}

export function getUser(req: Request): SessionUser {
  if (!req.session.user) {
    throw Object.assign(new Error('No autenticado'), { status: 401 });
  }
  return req.session.user;
}
