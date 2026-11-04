# Preparación del rol RLS en producción

La API utiliza `dermaops_app`, un usuario PostgreSQL con LOGIN, sin SUPERUSER
y sin BYPASSRLS. El propietario administrado puede tener BYPASSRLS sin ser
superusuario: no es una conexión válida para las consultas de la aplicación.
La API verifica el rol existente y la identidad de la conexión antes de escuchar.
En producción no crea roles ni reinstala las políticas RLS durante el arranque.

## Configuración inicial por el propietario

Publishing no copia roles ni sus GRANT desde desarrollo. Esta configuración es
manual sobre la base productiva; no es una migración automática ni un paso del
build. No copies la base de desarrollo ni reemplaces datos de producción.

1. Revisa las opciones de recuperación y elige un momento de poco tráfico.
2. Elige una contraseña fuerte y exclusiva para este rol. Guárdala como
   `RLS_DB_PASSWORD` en los secretos de producción de Publishing.
   No la pegues en el chat, en archivos del proyecto ni en Git.
3. En Database, selecciona **producción**, activa **Enable Editing** y abre
   la consola SQL. Revisa y ejecuta las instrucciones siguientes, sustituyendo
   el marcador por esa misma contraseña solo dentro de la consola privada.
   Escapa una comilla simple de la contraseña como dos comillas simples.
   No ejecutes este bloque si el rol ya existe: revisa primero su configuración.
   Selecciona todas las instrucciones del bloque y pulsa Run una sola vez:
   la consola las envuelve automáticamente en una transacción. No añadas
   instrucciones independientes `BEGIN;`, `COMMIT;` ni `ROLLBACK;`.

```sql
CREATE ROLE dermaops_app
  LOGIN PASSWORD '<MISMA CONTRASEÑA GUARDADA EN RLS_DB_PASSWORD>'
  NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO dermaops_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO dermaops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.users, public.doctors, public.doctor_name_mappings,
  public.appointments, public.attendances, public.prescriptions,
  public.prescription_items, public.daily_closures, public.imports,
  public.audit_logs
TO dermaops_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dermaops_app;
GRANT EXECUTE ON FUNCTION
  public.app_role(), public.app_doctor_id(), public.app_user_id(),
  public.app_scope(), public.app_auth_email(), public.app_auth_doctor_id(),
  public.app_is_admin(), public.app_is_clinic_wide(), public.app_is_writer(),
  public.app_can_see_doctor(text)
TO dermaops_app;
REVOKE ALL ON TABLE public.session FROM dermaops_app;
```

El `BEGIN` dentro de `DO $$ ... $$` pertenece al bloque de PostgreSQL:
conserva ese bloque completo, incluido su `BEGIN` y su `END`.

Si hay un error en el lote, no publiques hasta resolverlo. Este bloque
no cambia registros clínicos ni desactiva RLS; crea un usuario y concede permisos
sujetos a las políticas existentes. La tabla de sesiones sigue reservada a la
conexión administrativa.

4. Desactiva **Enable Editing**.
5. Comprueba con esta consulta de solo lectura:

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_roles WHERE rolname = 'dermaops_app';
```

Debe devolver `rolsuper = false`, `rolbypassrls = false`,
`rolcanlogin = true`. Publica y confirma el mensaje
`RLS activa (rol dermaops_app)`.

Para tablas nuevas protegidas por RLS, revisa también los permisos del rol;
no se conceden permisos de forma automática a todas las tablas futuras.

Referencia:
https://docs.replit.com/help/troubleshooting/databases#limited-support-roles
