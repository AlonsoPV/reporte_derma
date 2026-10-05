# DermaOps — Control operativo de clínica

Aplicación para administrar citas, atenciones, ingresos y cierres diarios de una clínica dermatológica.

## Run & Operate

- `pnpm --filter @workspace/reporte-derma run dev` — run the main React/Vite app
- `pnpm --filter @workspace/api-server run dev` — run the imported Express API
- `pnpm run db:migrate` — apply Prisma migrations to the development database
- `pnpm run db:seed` — add demo records; only run on an empty/demo database because the seed script clears existing app records
- `pnpm run build` — build the client and generate the Prisma client
- Runtime environment: Replit provides `DATABASE_URL` and `SESSION_SECRET`

## Stack

- pnpm workspace, React 19, Vite, Express 4, Prisma 6, PostgreSQL
- Imported application dependencies are declared in the workspace root `package.json`
- The React/Vite service is registered as the root web artifact; `/api` routes to the shared API service

## Where things live

- `client/` — React application
- `server/` — Express API, authentication, and business rules
- `shared/` — shared TypeScript schemas and types
- `prisma/` — PostgreSQL schema, migrations, and demo seed
- `artifacts/reporte-derma/` — Replit web artifact that launches the imported frontend
- `artifacts/api-server/` — Replit API service that launches the imported backend

## Architecture decisions

- The imported app keeps its original source layout at the workspace root.
- The web artifact uses the Replit-assigned `PORT` and root base path; browser requests to `/api` use the shared proxy.
- The API artifact starts the imported Express server on its assigned port.

## Product

- Admins can manage clinic operations, import appointment spreadsheets, review reports, and manage users/doctors.
- Doctors can review their agenda, record attendances, and close their daily work.

## User preferences

No additional preferences recorded.

## Gotchas

- Run Prisma migrations before starting with a fresh database.
- The demo seed script deletes existing records in the app tables before inserting sample data. Never run it against real clinic data.
- The repository's `.replit` file is not the active preview workflow; use the managed artifact workflows.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
