# FINDEN ISMS

Single Next.js 16 SaaS app: **ISO-aligned security management** (policies, RBAC) plus **BRS inventory operations** (planning, orders, logistics, sales, SAP integration).

**Current version:** `0.11.3`

## Stack

Next.js App Router · ShadCN · Tailwind · React Hook Form · Zod · Zustand · Auth.js v5 · Prisma · PostgreSQL (Supabase) · Pino · Resend · Supabase Storage · React PDF

## What's shipped

| Area | Features |
|------|----------|
| **Auth** | Email/password (Auth.js), tenant-scoped sessions, demo seed users |
| **Dashboard** | Ops KPIs (approvals, DIT, stock, ATR, planogram/MIL alerts) |
| **Settings** | Company, users, departments, roles, branches, warehouses, AORs, master data, status codes |
| **Planning** | BRS CSV forecast import, allocation, suggested auto-replenish orders (`/settings/planning`, `/planning/suggested-orders`) |
| **Planogram** | Per-branch SKU shelf capacity, MIL, order enforcement |
| **Policies** | Full document control (ISO track) |
| **Inventory** | Serialized stock, AOR-scoped list, **physical stock count** (`/inventory/stock-count`) |
| **Orders** | Manual / special / auto-replenish; PS → TL → SP; SO#, processed orders, delivery-due auto-reschedule |
| **Logistics** | Deliveries (accept/reject), transfers, pull-outs with SN movement |
| **Sales** | SN picker, reserved (RSV) sales, **BranchReturnRequest** ATR workflow |
| **Reports** | Processed orders, daily stock, transfers, sales (CSV export) |
| **SAP** | Outbound job queue + mock processor; **Service Layer** settings (all credentials encrypted at rest) |
| **RBAC** | ISO + BRS roles (PS, TL, SP/SPA, Logistics, AE), permission-gated sidebar |

### App routes

| Route | Access |
|-------|--------|
| `/` | Marketing landing |
| `/login`, `/register` | Auth |
| `/dashboard` | Authenticated app |
| `/inventory` | `inventory.view` |
| `/inventory/stock-count` | `inventory.view` |
| `/orders` | `orders.view` / `orders.create` / `orders.approve` |
| `/planning/suggested-orders` | `forecast.manage` / `planogram.manage` |
| `/logistics/deliveries`, `/transfers`, `/pickups` | `logistics.manage` |
| `/operations` | `inventory.view` (combined ops view) |
| `/sales` | `sales.create` |
| `/reports/processed-orders`, `/daily-stock`, `/transfers`, `/sales` | `reports.view` (+ module-specific) |
| `/policies`, `/policies/[id]`, `/policies/new` | Policy permissions |
| `/settings/company` | Tenant Admin / Super Admin |
| `/settings/users`, `/departments`, `/roles` | `users.manage` / `roles.manage` |
| `/settings/audit-log` | `reports.view` |
| `/settings/branches`, `/warehouses`, `/aors` | `branches.manage` / `aors.manage` |
| `/settings/planning`, `/planogram` | `forecast.manage` / `planogram.*` |
| `/settings/master-data/*` | `master_data.manage` |
| `/settings/sap-integration` | `logistics.manage` (queue) |
| `/settings/sap-integration/service-layer` | `logistics.manage` (B1 Service Layer config) |
| `/settings/permissions` | Super Admin only |
| `/settings/profile` | All authenticated users |

## Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/DEVELOPMENT_README.md`](docs/DEVELOPMENT_README.md) | Spec index, Process Flow v1.0 traceability, BRS ↔ app mapping |
| [`docs/sap-integration.md`](docs/sap-integration.md) | SAP queue, Service Layer config, implemented vs stub |
| [`database/seed-users.md`](database/seed-users.md) | Demo accounts and seed profiles |
| [`docs/release-notes.md`](docs/release-notes.md) | Release workflow |
| [`src/content/releases.ts`](src/content/releases.ts) | In-app What's New |

Process Flow reference: [`docs/PROCESS FLOW - ISMS (v1.0).pdf`](docs/PROCESS%20FLOW%20-%20ISMS%20(v1.0).pdf)

## Folder map

```text
src/
├── app/
│   ├── (marketing)/     # Public landing
│   ├── (auth)/          # Login, register
│   ├── (app)/           # Tenant app (dashboard, inventory, orders, logistics, settings, reports)
│   └── api/             # Auth, exports, policy attachments
├── components/          # Shared UI (ShadCN, data-table)
├── config/              # app-navigation, app-modules
├── content/             # releases.ts
├── features/            # Domain modules (actions, repositories, services)
├── lib/                 # auth, database, crypto, notifications
└── proxy.ts             # Route protection
```

## Setup

1. Copy env: `cp .env.example .env.local`
2. Set `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` (required for sessions and SAP credential encryption)
3. Install: `pnpm install`
4. Database:
   - `pnpm run db:generate`
   - `pnpm run db:migrate`
   - `pnpm run db:seed` (or `pnpm run db:seed:full` for BRS planogram demo data)
   - Run [`database/extensions.sql`](database/extensions.sql) in Supabase SQL editor
5. (Optional) Policy attachments: Supabase bucket `policy-documents`
6. (Optional) Workflow email: Resend
7. Dev: `pnpm run dev`

See [`database/supabase.example.md`](database/supabase.example.md) for connection details.

### Demo login

After seeding, use [`database/seed-users.md`](database/seed-users.md) (password: `DemoPass123`).

| User | Role | Typical use |
|------|------|-------------|
| `ps@demo.local` | Product Specialist | Manual order step 1, deliveries |
| `tl@demo.local` | Team Leader | Order endorse, transfers |
| `sp@demo.local` | Supply Planning | Final order approval |
| `admin@demo.local` | Tenant Admin | Full settings |
| `superadmin@demo.local` | Super Admin | Permissions, policies |

Or register at `/register` for a new tenant.

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm run dev` | Development server |
| `pnpm run build` | Production build |
| `pnpm run lint` | ESLint |
| `pnpm run typecheck` | `tsc --noEmit` |
| `pnpm run db:generate` | Prisma client |
| `pnpm run db:migrate` | Dev migrations |
| `pnpm run db:deploy` | Deploy migrations |
| `pnpm run db:seed` | Core seed (permissions, demo tenant, roles) |
| `pnpm run db:seed:full` | Full BRS demo (planogram CSV, 4 branches) |
| `pnpm run db:seed:brs` | BRS data only |
| `pnpm run db:studio` | Prisma Studio |
| `pnpm run docs:modules-matrix` | Regenerate `docs/ISMS_App_Modules_vs_Workflow.xlsx` |

## Optional env

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | Sessions + AES-256-GCM encryption for SAP Service Layer credentials |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (policy attachments) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only storage access |
| `RESEND_API_KEY` | Workflow email |
| `EMAIL_FROM` | Verified sender for Resend |
| `PRISMA_LOG_QUERIES=1` | SQL query logging in dev |
| `LOG_LEVEL` | Pino level (`debug` in dev, `info` in prod) |

## Publishing a release

1. Bump `version` in `package.json`
2. Prepend entry in `src/content/releases.ts`
3. Deploy — login footer and What's New update automatically

Details: [`docs/release-notes.md`](docs/release-notes.md).

## SAP integration (current)

- **Queue:** `/settings/sap-integration` — outbound jobs, mock processor (order → `sapDocRef` → delivery)
- **Service Layer:** `/settings/sap-integration/service-layer` — URL, company DB, username, password (encrypted at rest; audit fingerprints only)
- **Live SAP transport:** not yet connected — see [`docs/sap-integration.md`](docs/sap-integration.md)

## Route groups vs Master Plan

| Master Plan | This app |
|-------------|----------|
| `web` | `(marketing)` |
| `admin` | `(app)` |
| `api` | `app/api/` |
