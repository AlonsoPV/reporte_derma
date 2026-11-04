---
name: Managed production RLS
description: Production role capabilities differ from development, and custom role provisioning is outside automatic publishing.
---

Do not assume a managed production database owner is a PostgreSQL superuser or that custom roles are carried over by publishing.

**Why:** A read-only production check showed an owner with CREATEROLE and BYPASSRLS but not SUPERUSER, and no restricted application role. A superuser-only provisioning check therefore skipped the role and triggered the application's fail-closed RLS safeguard.

**How to apply:** Inspect actual role flags and restricted-role existence read-only. Preserve the fail-closed safeguard. Do not add production startup DDL as a workaround. Consult the current database skill for permitted remediation and the official troubleshooting page for objects publishing does not transfer. Read the source documentation: a documentation search summary incorrectly claimed all custom roles and RLS policies were unsupported; the page distinguishes role provisioning from supported policy migration.

Provision the production application role explicitly through the owner's private database console, not application startup. Use a dedicated password stored securely; the agent must not read or generate a credential into source files.

**Why:** Managed publishing does not transfer role objects or grants, while production database access available to the agent is read-only. Accepting the owner's BYPASSRLS connection would invalidate clinical data isolation.

**How to apply:** Keep manual role preparation separate from code publishing and clearly report that a verified development startup does not establish that production provisioning has been completed.

In Replit's SQL console, select all statements and execute them together; the console wraps the selection in a transaction. Do not instruct the user to run standalone BEGIN, COMMIT, or ROLLBACK. Preserve procedural BEGIN/END inside DO blocks.

**Why:** Explicit transaction commands produced the console's instruction to select multiple statements for automatic transaction batching; the official SQL-console documentation confirms this behavior.

**How to apply:** Write console instructions for a single selected batch without outer transaction commands, distinguishing them from procedural blocks.
