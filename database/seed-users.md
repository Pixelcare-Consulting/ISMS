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

Demo tenant is seeded as **Western Appliance Trade Group** (BRS **Dealer 1**). Branches require `pnpm run db:seed:full` or `db:seed:brs`.

### Dealer 1 → demo tenant branch map

| BRS CSV (Dealer 1) | ISMS branch | SAP code |
|--------------------|-------------|----------|
| Branch 1 | Western Makati | `WMK-001` |
| Branch 2 | Western Recto | `WRC-002` |
| Branch 3 | Western Quezon City | `WQC-003` |
| Branch 4 | Western Pasig | `WPAS-004` |

Planogram SKUs and shelf max quantities come from `docs/BRS Planogram & Forecast(Planogram & Target).csv` (Dealer 1 columns only). Brands **Devant** and **Sonique**; categories by series (e.g. 32STV, 50QUH). SWS-01 Free bundle rows are excluded. MIL defaults to 30 days where the CSV has no MIL column.

### Planning pipeline test path (steps 5–8)

1. `pnpm run db:seed:brs` — syncs planogram, Dec-25 forecast targets, aligned inventory serials
2. **Settings → Planning** (`sp@demo.local`) — confirm Dec-25 period and 4 branch revenue targets
3. **Run allocation** — gap rows for SKUs below shelf max (STK count only)
4. **Generate suggested orders** — draft `auto_replenish` orders per branch
5. **Submit for TL review** — moves drafts to `pending_tl`
6. **Orders** — TL approve → SP approve (existing workflow)
7. **Planogram / Inventory** — Western Makati shows Devant SKUs only; STK/DIT breakdown on planogram rows

Refresh planogram data without resetting users:

```bash
pnpm run db:seed:brs
```

### Full planning pipeline test path (after `db:seed:full` or `db:seed:brs`)

1. Log in as `sp@demo.local` → **Settings → Planning**
2. Confirm active period **Dec-25** and four branch revenue targets (Western Makati, Recto, QC, Pasig)
3. **Run allocation** — gap rows where STK count is below planogram max
4. **Generate suggested orders** — draft `auto_replenish` orders per branch
5. **Submit drafts for TL review** → log in as `tl@demo.local` → **Orders** → approve
6. Log in as `sp@demo.local` → approve SP step → logistics delivery queued
7. **Settings → Planogram** (Western Makati) — Devant/Sonique SKUs only; STK/DIT breakdown; **Inventory** links and off-planogram badge

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
