# FINDEN ISMS

Single Next.js 16 SaaS app: **ISO-aligned security management** (policies, RBAC) plus **BRS inventory operations** (planning, orders, logistics, sales, SAP integration).

**Current version:** `0.27.2`

## Stack

Next.js App Router · ShadCN · Tailwind · React Hook Form · Zod · Zustand · Better Auth · Prisma 7 · PostgreSQL (Docker / self-hosted) · Pino · Resend · Local filesystem storage · React PDF

## What's shipped

| Area | Features |
|------|----------|
| **Auth** | Email/password (Better Auth), tenant-scoped sessions, demo seed users |
| **Dashboard** | Role-aware activity cards (top 4); Inventory summary + Planning & alerts; This month (icons) beside Order pipeline; **Sales overview** (month KPIs, status mix, ATR/return pipeline, top branches/models) when you can access Sales & ATR; compliance overview when no ops access; active announcement banner |
| **Announcements** | Tenant posts (title, body, publish/expiry); list + CRUD (`/announcements`) |
| **Competitors** | Market observations with master Competitor + Competitor brand/model lookups, AOR-bound branch, optional promotion; KPIs + CRUD (`/competitors`) |
| **Settings** | Company, users, departments, roles, branches, warehouses, dealers, service centers, AORs (branches / warehouses / service centers assign + sync), master data (incl. Series / Categories, Competitors / Competitor brands), status codes (per-module tabs + badge colors); collapsible Module guides on complex settings/ops pages |
| **Planning** | BRS CSV forecast import, allocation, suggested auto-replenish orders (`/settings/planning`, `/planning/suggested-orders`) |
| **Planogram** | Per-branch SKU shelf capacity, MIL, order enforcement |
| **Policies** | Full document control (ISO track) |
| **Inventory** | Serialized stock (STK on Stock units), **warehouse stock** SN list (`/inventory/warehouse-stock`; also Settings → Warehouses → Stock), AOR-scoped lists, series QTY/VALUE + DR#/date/aging, **physical stock count / P-Count** (`/inventory/stock-count`) |
| **Orders** | Nav group: Manual / Special / Auto replenish (`/orders/manual` etc.); per-type `orders.manual`, `orders.special`, `orders.auto_replenish` with view/create/approve; PS → TL → SP; SO#, processed orders, delivery-due auto-reschedule |
| **Logistics** | Deliveries (accept/reject), transfers, pull-outs with SN movement; gated by `logistics.view` / `create` / `manage` |
| **Sales** | Encode at `/sales/new` (CTA from `/sales`); PS auto-branch; TL `sales.create` + branch picker; package detail modal (qty → N sets), reserved (RSV) sales; line Edit only for TO-FOLLOW; Accounting `sales.update` edits transaction headers; `/sales` **Sales \| Returns** tabs — Returns needs `sales.return.view` (ATR workflow stays on `sales.return.request` / evaluate / approve / complete; request still from Sale details) |
| **Service** | Service center ops (AOR-scoped): inventory + manual stock-in, sales + ATR (`ServiceCenterReturnRequest`), orders, deliveries (backload → STK), pull-outs under `/service-centers/*` |
| **Reports** | Processed orders, daily stock, transfers, sales CSV (`/reports/sales`), **P-Count** (`/reports/pcount`), **Official Sales** dealer-template staging — Action Key process (`ADD` / `WHSE_ADD` / `DEL` → Official Sold; already-OFS ADD is idempotent; DEL restores STK at Branch Sold; stock adjustments appear in Serial Number Logs; process summarizes failed serials), progress popup, View details, and ? quick guide (`/reports/official-sales`) |
| **SAP** | Outbound job queue + mock processor; **Service Layer** settings (encrypted credentials) + in-process session client with status UI (Connect/Logout) and refresh-on-401 |
| **RBAC** | ISO + BRS roles (PS, TL, SP/SPA, Logistics, AE, Accounting); shared action vocabulary + module allowlists; Roles simple checklist + module×action matrix; Sales Returns tab uses `sales.return.view`; ATR buttons use `sales.return.request` / evaluate / approve / complete; sale header Edit uses `sales.update`; Logistics uses `logistics.view` / `create` / `manage`; Service uses `service_centers.*` ops perms |

### App routes

| Route | Access |
|-------|--------|
| `/` | Marketing landing |
| `/login`, `/register` | Auth |
| `/dashboard` | Authenticated app |
| `/announcements` | `announcements.view` / `announcements.manage` |
| `/competitors` | `competitors.view` / `competitors.manage` |
| `/inventory` | `inventory.view` (Stock units: STK only, series summary, DR#/date/aging; Sold etc. in Sales) |
| `/inventory/warehouse-stock` | `inventory.view` or `warehouses.manage` (read-only warehouse SNs; AOR-scoped; `?warehouse=` / `?location=` / `?q=`) |
| `/inventory/stock-count` | `inventory.view` (nav alias: P-Count) |
| `/orders` | Redirects to first accessible order type (or dashboard) |
| `/orders/manual` | `orders.manual.view` / `create` / `approve` (or legacy `orders.*`) |
| `/orders/special` | `orders.special.view` / `create` / `approve` (or legacy `orders.*`) |
| `/orders/auto-replenish` | `orders.auto_replenish.view` / `create` / `approve` (or legacy `orders.*`) |
| `/planning/suggested-orders` | `forecast.manage` / `planogram.manage` |
| `/logistics/deliveries`, `/transfers`, `/pickups` | `logistics.view` / `create` / `manage` (legacy `orders.*` aliases for list) |
| `/operations` | `inventory.view` (combined ops view) |
| `/sales` | `sales.view` / `sales.create` / `sales.update` / `sales.return.view` / any ATR `sales.return.*` (Sales tab: view/create/update; Returns tab: `sales.return.view`; `?tab=returns`; New transaction needs `sales.create`; header Edit needs `sales.update`) |
| `/sales/new` | `sales.create` (multi-detail encode) |
| `/service-centers/inventory` | `service_centers.inventory.view` (+ manual stock-in via manage/logistics) |
| `/service-centers/sales`, `/service-centers/sales/new` | `service_centers.sales.*` / `service_centers.return.*` |
| `/service-centers/orders` | `service_centers.orders.view` / `create` / `approve` |
| `/service-centers/deliveries`, `/pullouts` | `service_centers.logistics.view` / `create` / `manage` |
| `/reports/processed-orders`, `/daily-stock`, `/transfers`, `/sales`, `/pcount`, `/official-sales` | `reports.view` (+ module-specific) |
| `/policies`, `/policies/[id]`, `/policies/new` | Policy permissions |
| `/settings/company` | Tenant Admin / Super Admin |
| `/settings/users`, `/roles` | `users.manage` / `roles.manage` |
| `/settings/departments` | `departments.manage` |
| `/audit-logs/system`, `/audit-logs/serial-numbers` | `audit_logs.view` |
| `/settings/branches`, `/settings/branch-quotas` | `branches.manage` (Import template: form-aligned Branches sheet + prefills; creates missing sap_codes; accepts PSG ISMS; optional legacy Allowed Models; schedule UX shows company locked days + frequency suggestions) |
| `/settings/ordering` | `ordering_settings.manage` (company locked weekdays + optional daily time lock in Manila, scoped to selected order modules; frequency code catalog incl. Daily / Three times a month) |
| `/settings/warehouses` | `warehouses.manage` (Warehouses setup + Stock tab → `/inventory/warehouse-stock`) |
| `/settings/dealers` | `dealers.manage` |
| `/settings/service-centers` | `service_centers.manage` |
| `/settings/aors` | `aors.manage` |
| `/settings/planning`, `/planogram` | `forecast.manage` / `planogram.*` |
| `/settings/master-data/*` | `master_data.manage` (Models: Import template + upload; creates new SKUs / updates existing; our template only) |
| `/settings/sap-integration` | `sap.manage` (queue) |
| `/settings/sap-integration/service-layer` | `sap.manage` (B1 Service Layer config) |
| `/settings/permissions` | Super Admin only |
| `/settings/profile` | All authenticated users |

## Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/CLIENT_WORKFLOW.md`](docs/CLIENT_WORKFLOW.md) | Client-facing How ISMS works (Mermaid master + role swimlanes) |
| [`docs/DEVELOPMENT_README.md`](docs/DEVELOPMENT_README.md) | Spec index, Process Flow v1.0 traceability, BRS ↔ app mapping |
| [`docs/PROCESS_FLOW_COVERAGE.md`](docs/PROCESS_FLOW_COVERAGE.md) | Process Flow steps 1–45 coverage matrix (Implemented / Partial / Missing) |
| [`docs/sap-integration.md`](docs/sap-integration.md) | SAP queue, Service Layer config, implemented vs stub |
| [`docs/official-sales-gap-spec.md`](docs/official-sales-gap-spec.md) | Official Sales flowchart (WHSE_ADD / ADD / DEL) + remaining UPD / warehouse gaps |
| [`docs/uat-feedback-sales-2026-07-28-triage.md`](docs/uat-feedback-sales-2026-07-28-triage.md) | UAT PS/TL/Inventory feedback ticket triage |
| [`docs/sales-nav-revalidation.md`](docs/sales-nav-revalidation.md) | PS/TL `/sales` nav + `sales.create` revalidation |
| [`database/seed-users.md`](database/seed-users.md) | Demo accounts and seed profiles |
| [`database/postgres.example.md`](database/postgres.example.md) | Docker Postgres, env, migrate, storage |
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
├── content/             # releases.ts, page-tutorials, module-guides
├── features/            # Domain modules (actions, repositories, services)
├── lib/                 # auth, database, crypto, notifications, storage
└── proxy.ts             # Route protection
```

## Setup

1. Start Postgres: `docker compose up -d`
2. Copy env: `cp .env.example .env.local` — set `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` / `BETTER_AUTH_SECRET`
3. Install: `pnpm install`
4. Database:
   - `pnpm run db:generate`
   - `pnpm run db:migrate`
   - `pnpm run db:seed` (or `pnpm run db:seed:full` for BRS planogram demo data)
   - `pnpm run db:seed:branches` to upsert PH regions/provinces + PSG ISMS branches (~1k coded rows from `docs/07.29.26 - PSG ok.xlsx`) for all tenants — safe to re-run; may take a bit
   - `pnpm run db:seed:psg` after branches to upsert PSG MODEL catalog (~1.5k SKUs, all tenants) + Outgoing serial stock (demo tenant, STK) — safe to re-run
   - Run [`database/extensions.sql`](database/extensions.sql) against local Postgres (`psql` or `docker compose exec`)
5. (Optional) Policy / audit files land under `STORAGE_ROOT` (default `.data/uploads`)
6. (Optional) Workflow email: Resend
7. Dev: `pnpm run dev`

See [`database/postgres.example.md`](database/postgres.example.md) for connection details and cutover notes.

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
| `pnpm run db:seed` | Core seed (permissions, demo tenant, roles) + PH regions/provinces |
| `pnpm run db:seed:full` | Full BRS demo + PH geo + PSG branches (~1k; may take a bit) |
| `pnpm run db:seed:brs` | BRS data only |
| `pnpm run db:seed:branches` | PH regions/provinces + PSG ISMS branches for all tenants |
| `pnpm run db:seed:psg` | PSG MODEL catalog (all tenants) + Outgoing serial stock (demo); run after `db:seed:branches` |
| `pnpm run db:seed:warehouse-inventory` | Demo warehouse serials (SN-WHSE-001…003 on PASIG-MAIN/A1) for Official Sales WHSE_ADD; requires BRS seed first |
| `pnpm run db:studio` | Prisma Studio |
| `pnpm run docs:modules-matrix` | Regenerate `docs/ISMS_App_Modules_vs_Workflow.xlsx` |

## Optional env

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` / `BETTER_AUTH_SECRET` | Sessions + AES-256-GCM encryption for SAP Service Layer credentials |
| `BETTER_AUTH_URL` / `AUTH_URL` | App origin for Better Auth |
| `STORAGE_ROOT` | Local uploads directory (default `.data/uploads`) |
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
- **Session client:** in-process B1SESSION cache with TTL + single re-login on 401; Service Layer settings show Connected/Idle status, masked session id, countdown, and Connect/Logout (Test connection still probes without keeping a session)
- **Live SAP transport:** not yet connected — queue still uses the mock processor; see [`docs/sap-integration.md`](docs/sap-integration.md)

## Route groups vs Master Plan

| Master Plan | This app |
|-------------|----------|
| `web` | `(marketing)` |
| `admin` | `(app)` |
| `api` | `app/api/` |
