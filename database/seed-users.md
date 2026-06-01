# Demo seed users

Dev-only accounts created by `pnpm run db:seed`. Use on `/login`.

**Password (all users):** `DemoPass123`

## Seed profiles

| Command | What it loads | When to use |
|---------|---------------|-------------|
| `pnpm run db:seed` | **minimal** — users, roles, permissions, status codes | Default after migrate (fast) |
| `pnpm run db:seed:full` | minimal + BRS demo (branches, planogram, sample SNs) | First-time demo / inventory testing |
| `pnpm run db:seed:core` | users, roles, permissions only | Reset logins without touching ops data |
| `pnpm run db:seed:status` | reason/status lookup codes only | After adding new workflow status codes |
| `pnpm run db:seed:brs` | BRS demo data only | Refresh branches/planogram without resetting users |
| `pnpm run db:migrate:only` | migrate without seed | Faster schema-only migrations |

Optional env: `SEED_BCRYPT_ROUNDS=8` (default) — lower for faster local re-seed.

## ISO / admin roles

| Role | Name | Email |
|------|------|-------|
| Super Admin | Super Admin | `superadmin@demo.local` |
| Tenant Admin | Tenant Admin | `admin@demo.local` |
| ISMS Manager | ISMS Manager | `isms@demo.local` |
| Auditor | Auditor | `auditor@demo.local` |
| Department Head | Department Head | `depthead@demo.local` |
| Employee | Employee | `employee@demo.local` |

## BRS ops roles (Western Appliance demo)

| Role | Name | Email | Typical use |
|------|------|-------|-------------|
| PS | Product Specialist | `ps@demo.local` | Create orders, sales; Makati AOR |
| TL | Team Leader | `tl@demo.local` | Approve orders/transfers |
| SP | Sales Planner | `sp@demo.local` | Master data, order approval |
| Logistics | Logistics Coordinator | `logistics@demo.local` | Deliveries, pull-outs |
| AE | Account Executive | `ae@demo.local` | Multi-branch dashboard view |

Demo tenant is seeded as **Western Appliance Trade Group**. Branches (Makati, Recto, Quezon City) require `pnpm run db:seed:full` or `db:seed:brs`.

## Login example

1. Open `/login`
2. Email: `ps@demo.local`
3. Password: `DemoPass123`

## Re-seed

```bash
pnpm run db:seed        # fast — users + status codes
pnpm run db:seed:full   # includes BRS demo inventory
```

Upserts users and resets passwords to `DemoPass123`.

## Security

Do not use these credentials in production. Rotate or omit seed users before deploying.
