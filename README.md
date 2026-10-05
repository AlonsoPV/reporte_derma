# DermaOps — Control operativo de clínica

Aplicación web full-stack para el control diario de citas, pacientes atendidos, ingresos y cierre diario de una clínica médica. Diseñada para importar agendas desde Huli (Excel) y operar el flujo día a día de cada doctor.

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express + sesiones seguras (`express-session` + PostgreSQL store)
- **ORM / DB:** Prisma + PostgreSQL
- **Excel:** `xlsx` (importación) + `exceljs` (exportación)
- **Deploy:** Replit (Node 20 + PostgreSQL)

## Arquitectura

```
/
├── client/          # SPA React (Vite)
├── server/          # API Express + auth + reglas de negocio
├── shared/          # constantes y schemas Zod compartidos
├── prisma/          # schema, migraciones y seed demo
├── uploads/imports/ # archivos temporales de importación
└── .replit          # configuración de ejecución
```

En desarrollo:
- Vite en `:5173` con proxy a la API
- API Express en `:5000`

En producción (Replit):
- `npm run build` genera `client/dist`
- `npm start` sirve API + frontend estático desde Express

## Modelo de datos

| Entidad | Descripción |
|---------|-------------|
| `users` | Acceso al sistema (rol, estatus, doctor opcional) |
| `doctors` | Entidad operativa del médico |
| `doctor_name_mappings` | Texto Excel → doctor interno |
| `appointments` | Citas Huli (`external_appointment_id` único) |
| `attendances` | Atenciones (agendado o sin cita) |
| `daily_closures` | Cierre diario por doctor+fecha |
| `imports` | Historial de importaciones |
| `audit_logs` | Auditoría de cambios críticos |
| `session` | Sesiones persistentes |

**Separación de estados:**
- Estado Huli (`sourceStatus`, `attendanceConfirmation`)
- Estado operativo interno (`PENDING`, `ATTENDED`, `NO_SHOW`, `CANCELLED`, `RESCHEDULED`)

## Roles

### DOCTOR
- Ver solo sus citas/atenciones/reportes
- Atender, registrar sin cita, cerrar su día

### ADMINISTRADOR
- Ver toda la operación
- Importar Excel, administrar usuarios/doctores, reabrir cierres, auditoría

Roles preparados para crecer: `RECEPTION`, `SUPERVISOR`, `ACCOUNTING`.

## Credenciales demo

Contraseña para todos: `Demo123!`

| Usuario | Correo | Rol |
|---------|--------|-----|
| Administrador | `admin@clinicademo.local` | ADMIN |
| Dra. Berenice | `berenice@clinicademo.local` | DOCTOR |
| Dr. Carlos | `carlos@clinicademo.local` | DOCTOR |
| Dra. Ana | `ana@clinicademo.local` | DOCTOR |

Los datos demo se marcan con `isDemo=true` / `dataSource=DEMO` y están separados de importaciones reales.

## Variables de entorno

Copia `.env.example` a `.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/reporte_derma?schema=public"
SESSION_SECRET="una-cadena-larga-y-aleatoria"
NODE_ENV="development"
PORT=5000
TZ="America/Mexico_City"
```

En Replit:
1. Crea un PostgreSQL Database (Tools → Database)
2. Copia `DATABASE_URL` a Secrets
3. Agrega `SESSION_SECRET` a Secrets

## Cómo correr en local

```bash
npm install
cp .env.example .env   # edita DATABASE_URL
npm run db:setup       # migrate/push + seed
npm run dev            # API + Vite
```

- Frontend: http://localhost:5173
- API: puerto de `PORT` en `.env` (por defecto `5000`; en este entorno local se usó `5050` por conflicto de puertos)

Si PostgreSQL no está corriendo en Windows:

```powershell
.\scripts\start-postgres.ps1
```

## Cómo desplegar en Replit

1. Importa este repositorio en Replit
2. Configura Secrets: `DATABASE_URL`, `SESSION_SECRET`
3. En Shell:

```bash
npm install
npm run db:setup
npm run build
npm start
```

O usa el botón **Run**. El archivo `.replit` está preparado para puerto `5000`.

Para producción con migraciones:

```bash
npm run db:migrate
npm run db:seed
npm run build
npm start
```

## Cómo importar Excel (Huli)

Columnas esperadas:

`Fecha, Inicio, Fin, Duración, Nombre, Teléfono, Seguro, Fecha de Nacimiento, Correo, Estado, Asistencia, Etiquetas, Notas, Calendario, Doctor, ID cita`

Flujo:
1. Entra como admin → **Importar**
2. Sube el `.xlsx`
3. Revisa preview (nuevas / existentes / actualizadas / canceladas / errores / doctores)
4. Confirma o cancela
5. El sistema hace **upsert por `ID cita`** (no duplica)

Si aparece un doctor desconocido, la fila **no se descarta**. Mapea el nombre en **Administración → Doctores**.

## Flujo diario del doctor

```
Login → Hoy → Ver agenda → Atender → Tratamiento + Monto → Guardar → Siguiente
```

Al final del día: **Cerrar día** (exige clasificar pendientes).

## Backup de base de datos

```bash
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d).sql
```

Restaurar:

```bash
psql "$DATABASE_URL" < backup_YYYYMMDD.sql
```

En Replit puedes usar la consola de Database o exportar desde un Shell con `pg_dump`.

## Scripts útiles

| Script | Uso |
|--------|-----|
| `npm run dev` | Desarrollo (API + Vite) |
| `npm run build` | Build del frontend |
| `npm start` | Servidor producción |
| `npm run db:setup` | Schema + seed |
| `npm run db:seed` | Solo seed demo |
| `npm run db:migrate` | Aplicar migraciones |

## Casos de prueba cubiertos

1. Importar Excel → citas al doctor correcto  
2. Doctor A no ve datos de Doctor B (filtro backend)  
3. Atender → sale de pendientes y entra a atendidos  
4. Paciente sin cita → origen `WALK_IN`  
5. Cerrar con pendientes → bloqueado  
6. Cierre correcto → snapshot del día  
7. Reportes por rango → totales consistentes  
8. Reimportar mismo Excel → sin duplicados  
9. Reimportar con cambios → update + auditoría  
10. Admin modifica monto → auditoría  

## Seguridad

- Hash de contraseñas con bcrypt
- Sesiones HTTP-only en PostgreSQL
- Autorización por rol en backend
- Aislamiento por `doctorId` en queries (no solo UI)
- Sin hard delete de información operativa
- Auditoría de importación, atención, cambios y reaperturas
