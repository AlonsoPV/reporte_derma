import 'dotenv/config';

process.env.TZ = 'America/Mexico_City';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { connectAppDatabase, ensureMultiAttendances, ensurePrescriptionTables, prismaAdmin } from './db';

import authRoutes from './routes/auth';
import appointmentRoutes from './routes/appointments';
import importRoutes from './routes/imports';
import closureRoutes from './routes/closures';
import reportRoutes from './routes/reports';
import adminRoutes from './routes/admin';
import {
  apiAbuseGuard,
  cookieOptions,
  csrfOriginCheck,
  rejectWritesIfReadOnly,
  rlsContextMiddleware,
} from './middleware/auth';

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProd = process.env.NODE_ENV === 'production';
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  cors({
    origin: isProd
      ? (process.env.APP_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean)
      : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  }),
);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});
app.use('/api', apiAbuseGuard);
app.use('/api', csrfOriginCheck);

const sessionSecret = process.env.SESSION_SECRET?.trim() || '';
if (!isDev && sessionSecret.length < 32) {
  console.error('SESSION_SECRET de al menos 32 caracteres es obligatorio fuera de development');
  process.exit(1);
}

const PgSession = connectPgSimple(session as typeof import('express-session'));
app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    name: 'dermaops.sid',
    secret: sessionSecret || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: cookieOptions(),
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use(rlsContextMiddleware);
app.use('/api', rejectWritesIfReadOnly);
app.use('/api/auth', authRoutes);
app.use('/api', appointmentRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/closures', closureRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

const clientDist = path.join(process.cwd(), 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = (err as Error & { status?: number }).status;
  res.status(status && status >= 400 && status < 600 ? status : 500).json({
    error: isProd ? 'Error interno' : err.message || 'Error interno',
  });
});

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  if (isProd && (!process.env.APP_ORIGIN || !process.env.APP_ORIGIN.trim())) {
    console.warn('APP_ORIGIN no definido: CORS estricto y checks de origen pueden bloquear el front');
  }
  await prismaAdmin.$connect();
  await ensureMultiAttendances();
  await ensurePrescriptionTables();
  const rls = await connectAppDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    console.log(
      `RLS ${rls.usingAppRole ? 'activa (rol dermaops_app)' : `en políticas; conexión ${rls.adminRole}`}`,
    );
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
