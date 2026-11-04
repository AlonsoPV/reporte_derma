# Security Audit — DermaOps / reporte_derma

**Fecha:** 2026-11-03  
**Alcance:** Aplicación full-stack autorizada (repo local). Sin pruebas destructivas en producción.  
**Stack verificado:** Express + express-session + Prisma + PostgreSQL + React/Vite. **No usa Supabase.**

## Resumen ejecutivo

Se identificaron controles útiles ya desplegados (FORCE RLS, aislamiento por doctor en API, regeneración de sesión, filtrado de `passwordHash`, roles en rutas admin). Persistían riesgos altos en el aislamiento del contexto RLS por request, revalidación de sesión, amplitud del scope `auth`, dependencia `xlsx`, endurecimiento de arranque y superficie de importación.

Este documento refleja el diagnóstico y el plan aprobado. Las correcciones se implementan de forma incremental tras la aprobación del plan completo.

## Inventario auditado

| Componente | Hallazgo |
|------------|----------|
| Auth | Sesión cookie `dermaops.sid`, store PostgreSQL `session` |
| Roles | ADMIN, DOCTOR, RECEPTION, SUPERVISOR, ACCOUNTING |
| RLS | FORCE en tablas operativas; `session` sin FORCE |
| Storage/Buckets | N/A |
| Webhooks | N/A |
| Hosting | Replit (documentado); HTTPS/HSTS de borde **NO VERIFICADO** en prod |

### Tablas y RLS (DB local verificada)

| Tabla | ENABLE | FORCE | Políticas |
|-------|--------|-------|-----------|
| users, doctors, mappings, appointments, attendances, prescriptions, prescription_items, daily_closures, imports, audit_logs | sí | sí | sí |
| session | no (pre-fix) → ENABLE sin FORCE post-fix | no | denegación por defecto + REVOKE app role |

## Hallazgos priorizados

| ID | Severidad | Estado plan |
|----|-----------|-------------|
| H1 | Alta — ALS `enterWith` / bleed de contexto | Corregir |
| H2 | Alta — sesión sin revalidar rol/status | Corregir |
| H3 | Alta — `scope=auth` lee todos los users | Corregir |
| H4 | Alta — `xlsx` vulnerable | Corregir (exceljs) |
| H5 | Alta — `trust proxy` + `proxy-addr` | Mitigar + actualizar |
| H6 | Alta — migración RLS incompleta | Corregir |
| H7 | Media/Alta — credenciales demo | Guardrail seed + password más fuerte |
| H8 | Media — fail-open si no hay `NODE_ENV=production` | Fail-closed |
| H9 | Media — uploads / preview PHI | Cleanup + sin path absoluto |
| H10 | Media — rate limit solo login in-memory | Ampliar |
| H11 | Media — password débil | min 12 + complejidad |
| H12 | Media — `session` sin RLS/GRANT | ENABLE sin FORCE + revoke |
| H13 | Media — clinic-wide lee todo PHI | **Residual** (decisión de negocio; no se restringe) |
| H14 | Media — CSRF residual | Origin/Referer check + SameSite |
| H15 | Media — sin HSTS | Añadir en prod |
| H16 | Baja/Media — deps audit | Actualizar |
| H17 | Baja — listado público de médicos | Rate limit |
| H18 | Baja — `clearCookie` incompleto | Alinear opciones |

## Matriz RLS objetivo

| Tabla | SELECT | WRITE | Notas |
|-------|--------|-------|-------|
| users | admin / self / auth acotado a email o doctorId | admin | Lookup login acotado |
| doctors | clinic-wide / own / auth (activos) | admin | Login list |
| appointments, attendances, prescriptions, closures | `app_can_see_doctor` | writer + can_see | |
| prescription_items | join a prescriptions | writer + join | |
| imports, mappings | admin | admin | |
| audit_logs | admin / own / auth insert | insert controlado | |
| session | owner store only | owner store only | sin FORCE |

## Correcciones y rollback

1. Contexto RLS por `AsyncLocalStorage.run` en el middleware de request.  
2. Revalidación de usuario en `requireAuth`.  
3. Settings `app.auth_email` / `app.auth_doctor_id` + políticas estrechas.  
4. Migración SQL completa de políticas (reversible con DROP POLICY / DISABLE).  
5. Arranque fail-closed, HSTS, checks Origin, rate limits.  
6. Import con ExcelJS; borrar temporales; no guardar path absoluto.  
7. Passwords ≥12; seed bloqueado si `NODE_ENV=production`.  

**Rollback:** revertir commit(s) de seguridad; migración down elimina policies nuevas y restaura funciones previas si aplica. Sesiones existentes siguen válidas tras deploy salvo rotación de `SESSION_SECRET`.

## Evidencias de pruebas

Script: `scripts/reporte-derma/security-regression.ts`

| Prueba | Resultado |
|--------|-----------|
| Login Ana/Carlos/admin/recepción | Aprobada |
| Listado Ana 41 vs admin 130 | Aprobada |
| Spoof `doctorId` ignorado | Aprobada |
| IDOR cita ajena → 404/403 | Aprobada |
| Recepción POST walk-in → 403 | Aprobada |
| Doctor → `/api/admin/users` → 403 | Aprobada |
| Sin `passwordHash` en admin users | Aprobada |
| RLS empty count = 0 | Aprobada |
| RLS auth sin identidad = 0 users | Aprobada |
| RLS auth + email = 1 user | Aprobada |
| `session` ENABLE sin FORCE | Aprobada |
| HTTPS/HSTS edge Replit | NO VERIFICADO |
| Bleed concurrente bajo carga | NO VERIFICADO |

## Riesgos residuales

- H13: roles clinic-wide con lectura global de PHI (diseño actual).  
- TLS/HSTS del edge de Replit **NO VERIFICADO**.  
- Rate limit in-memory no compartido entre réplicas.  
- Sin MFA.  
- Dependencias: tras quitar `xlsx`, `pnpm audit --prod` aún reporta hallazgos en cadena Express/`proxy-addr`/`body-parser`/Zod (revisar en cada deploy).  
- Contraseña demo local rotada a `DermaOps-Demo123!` (solo entornos demo).

## Checklist pre-despliegue

- [ ] `NODE_ENV=production`  
- [ ] `SESSION_SECRET` ≥ 32 chars (y rotado si hubo fuga)  
- [ ] `DATABASE_URL` sin BYPASSRLS o con rol `dermaops_app`  
- [ ] Passwords demo rotados / seed no ejecutado en prod  
- [ ] Migraciones aplicadas  
- [ ] HTTPS en el dominio público  
- [ ] `pnpm audit` revisado  
- [ ] Regression de seguridad en verde  

## Plan de rollback

1. Redeploy del commit anterior.  
2. Si hace falta: `DROP POLICY` de políticas nuevas / restaurar backup DB.  
3. Invalidar sesiones rotando `SESSION_SECRET` solo si se sospecha compromiso.
