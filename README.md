# FINDEN ISMS

Single Next.js 16 SaaS app for ISO-aligned information security management.

**Current version:** `0.8.0` (Hybrid BRS inventory ops — Sprints 3–8 MVP)

## Stack

Next.js App Router · ShadCN · Tailwind · React Hook Form · Zod · Zustand · Auth.js v5 · Prisma · PostgreSQL (Supabase) · Pino · Resend · Supabase Storage · React PDF

## What's shipped (v0.8.0)

| Area | Features |
|------|----------|
| **Auth** | Email/password sign-in (Auth.js), tenant-scoped sessions, demo seed users |
| **Dashboard** | Ops KPIs (pending approvals, DIT, stock, ATR), module cards, recent users |
| **Settings** | Company, users, departments, roles, audit log, **branches**, **master data**, **AORs** |
| **Policies** | Full document control (v0.2.0) — parallel ISO track |
| **Inventory** | Serialized `BranchInventory`, AOR-scoped `/inventory`, audited status changes |
| **Orders** | Branch orders with PS → TL → SP → Logistics approval workflow |
| **Logistics** | Delivery acceptance, branch transfer, pull-out (MVP) |
| **Sales** | Branch sales stub with ATR status |
| **RBAC** | ISO roles + BRS roles (PS, TL, SP, Logistics, AE), permission-gated sidebar |
| **Docs** | [`/README.md`](README.md) — BRS PDF index and hybrid Tenant/Branch mapping |

### App routes

| Route | Access |
|-------|--------|
| `/` | Marketing landing |
| `/login`, `/register` | Auth |
| `/dashboard` | Authenticated app |
| `/settings/company` | Tenant Admin / Super Admin |
| `/settings/users` | `users.manage` |
| `/settings/departments` | `users.manage` |
| `/settings/audit-log` | `reports.view` |
| `/settings/roles` | `roles.manage` |
| `/policies`, `/policies/[id]` | `policies.view` (approved only) / `policies.create` / `policies.approve` |
| `/policies/new` | `policies.create` |
| `/inventory` | `inventory.view` |
| `/orders` | `orders.view` / `orders.create` / `orders.approve` |
| `/logistics` | `logistics.manage` |
| `/sales` | `sales.create` |
| `/settings/branches` | `branches.manage` |
| `/settings/master-data/*` | `master_data.manage` |
| `/settings/aors` | `aors.manage` |
| `/settings/permissions` | Super Admin only |
| `/settings/profile` | All authenticated users |

## Folder map

```text
src/
├── app/
│   ├── (marketing)/     # Public landing
│   ├── (auth)/          # Login, register, auth shell
│   ├── (app)/           # Tenant app (dashboard, settings, policies)
│   └── api/             # Auth, policy PDF & attachment download
├── components/          # Shared UI (ShadCN, data-table, whats-new-dialog)
├── config/              # app-navigation, app-modules
├── content/             # releases.ts — in-app release notes
├── features/            # Domain modules (actions, repos, services)
├── lib/                 # auth, database, notifications, storage
├── utils/               # cn(), image helpers
├── hooks/               # Client hooks (Zustand)
└── proxy.ts             # Protects /dashboard, /settings, /policies
```

## Setup

1. Copy env: `cp .env.example .env.local`
2. Set `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` (see [`database/supabase.example.md`](database/supabase.example.md))
3. Install: `pnpm install`
4. Database:
   - `pnpm run db:generate`
   - `pnpm run db:migrate`
   - `pnpm run db:seed`
   - Run [`database/extensions.sql`](database/extensions.sql) in Supabase SQL editor
5. (Optional) Policy attachments: create Storage bucket `policy-documents`.
6. (Optional) Workflow email: Resend.
7. Dev: `pnpm run dev`

### Demo login

After seeding, use the accounts in [`database/seed-users.md`](database/seed-users.md) (password: `DemoPass123`).

| User | Role | Policies access |
|------|------|-----------------|
| `employee@demo.local` | Employee | View approved only |
| `superadmin@demo.local` | Super Admin | Full workflow |
| `admin@demo.local` | Tenant Admin | Full workflow |

Or register at `/register` to create a new tenant (Tenant Admin on a fresh org).

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
| `pnpm run db:seed` | Seed permissions, demo tenant, roles, demo users |
| `pnpm run db:studio` | Prisma Studio |

## Optional env

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (policy attachments) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only storage access |
| `RESEND_API_KEY` | Policy workflow email |
| `EMAIL_FROM` | Verified sender for Resend |
| `PRISMA_LOG_QUERIES=1` | Enable SQL query logging in dev |
| `LOG_LEVEL` | Pino log level (default: `debug` in dev, `info` in prod) |

## Publishing a release

1. Bump `version` in `package.json`
2. Prepend entry in `src/content/releases.ts` (newest first)
3. Deploy — login footer and What's new dialog update automatically

Full workflow: [`docs/release-notes.md`](docs/release-notes.md).

## Route groups vs Master Plan

| Master Plan | This app |
|-------------|----------|
| `web` | `(marketing)` |
| `admin` | `(app)` |
| `api` | `app/api/` |
