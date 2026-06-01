# Demo seed users

Dev-only accounts created by `npm run db:seed`. Use on `/login`.

**Password (all users):** `DemoPass123`

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

Demo tenant is seeded as **Western Appliance Trade Group** with branches Makati, Recto, and Quezon City.

## Login example

1. Open `/login`
2. Email: `ps@demo.local`
3. Password: `DemoPass123`

## Re-seed

```bash
npm run db:seed
```

Upserts users and resets passwords to `DemoPass123`.

## Security

Do not use these credentials in production. Rotate or omit seed users before deploying.
