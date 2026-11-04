---
name: Managed production RLS
description: Production role capabilities differ from development, and custom role provisioning is outside automatic publishing.
---

Do not assume a managed production database owner is a PostgreSQL superuser or that custom roles are carried over by publishing.

**Why:** A read-only production check showed an owner with CREATEROLE and BYPASSRLS but not SUPERUSER, and no restricted application role. A superuser-only provisioning check therefore skipped the role and triggered the application's fail-closed RLS safeguard.

**How to apply:** Inspect actual role flags and restricted-role existence read-only. Preserve the fail-closed safeguard. Do not add production startup DDL as a workaround. Consult the current database skill for permitted remediation and the official troubleshooting page for objects publishing does not transfer. Read the source documentation: a documentation search summary incorrectly claimed all custom roles and RLS policies were unsupported; the page distinguishes role provisioning from supported policy migration.
