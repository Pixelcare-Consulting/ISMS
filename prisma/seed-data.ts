/** Shared seed constants — no DB access. */

export const DEMO_PASSWORD = "DemoPass123";

export const DEMO_USERS = [
  { email: "superadmin@demo.local", name: "Super Admin", roleSlug: "super_admin" },
  { email: "admin@demo.local", name: "Tenant Admin", roleSlug: "tenant_admin" },
  { email: "isms@demo.local", name: "ISMS Manager", roleSlug: "isms_manager" },
  { email: "auditor@demo.local", name: "Auditor", roleSlug: "auditor" },
  { email: "depthead@demo.local", name: "Department Head", roleSlug: "dept_head" },
  { email: "employee@demo.local", name: "Employee", roleSlug: "employee" },
  { email: "ps@demo.local", name: "Branch PS", roleSlug: "ps" },
  { email: "tl@demo.local", name: "Team Leader", roleSlug: "tl" },
  { email: "sp@demo.local", name: "Sales Planner", roleSlug: "sp" },
  { email: "logistics@demo.local", name: "Logistics", roleSlug: "logistics" },
  { email: "ae@demo.local", name: "Area Executive", roleSlug: "ae" },
] as const;

export const PERMISSIONS = [
  { slug: "dashboard.manage", name: "Manage Dashboard" },
  { slug: "company.manage", name: "Manage company settings" },
  { slug: "users.manage", name: "Manage users" },
  { slug: "roles.manage", name: "Manage roles" },
  { slug: "policies.view", name: "View policies" },
  { slug: "policies.create", name: "Create policies" },
  { slug: "policies.approve", name: "Approve policies" },
  { slug: "audits.create", name: "Create audits" },
  { slug: "audits.close", name: "Close audits" },
  { slug: "reports.view", name: "View reports" },
  { slug: "branches.manage", name: "Manage branches" },
  { slug: "master_data.manage", name: "Manage master data" },
  { slug: "status_settings.manage", name: "Manage status settings" },
  { slug: "aors.manage", name: "Manage areas of responsibility" },
  { slug: "inventory.view", name: "View inventory" },
  { slug: "inventory.manage", name: "Manage inventory" },
  { slug: "orders.view", name: "View branch orders" },
  { slug: "orders.create", name: "Create branch orders" },
  { slug: "orders.approve", name: "Approve branch orders" },
  { slug: "logistics.manage", name: "Manage logistics" },
  { slug: "sales.create", name: "Create sales transactions" },
  { slug: "planogram.view", name: "View branch planogram" },
  { slug: "planogram.manage", name: "Manage branch planogram and MIL" },
  { slug: "forecast.manage", name: "Manage forecast, allocation, and suggested orders" },
] as const;

export const ROLES = [
  {
    slug: "super_admin",
    name: "Super Admin",
    description: "Platform operator",
    permissions: PERMISSIONS.map((p) => p.slug),
  },
  {
    slug: "tenant_admin",
    name: "Tenant Admin",
    description: "Tenant administrator",
    permissions: [
      "dashboard.manage",
      "company.manage",
      "users.manage",
      "roles.manage",
      "policies.create",
      "policies.approve",
      "audits.create",
      "audits.close",
      "reports.view",
      "branches.manage",
      "master_data.manage",
      "status_settings.manage",
      "aors.manage",
      "inventory.view",
      "orders.view",
      "orders.create",
      "orders.approve",
      "logistics.manage",
      "sales.create",
      "planogram.manage",
      "forecast.manage",
    ],
  },
  {
    slug: "isms_manager",
    name: "ISMS Manager",
    description: "ISMS program manager",
    permissions: [
      "dashboard.manage",
      "users.manage",
      "policies.create",
      "policies.approve",
      "audits.create",
      "audits.close",
      "reports.view",
    ],
  },
  {
    slug: "auditor",
    name: "Auditor",
    description: "Internal auditor",
    permissions: ["dashboard.manage", "audits.create", "audits.close", "reports.view", "policies.view"],
  },
  {
    slug: "dept_head",
    name: "Department Head",
    description: "Department head",
    permissions: ["dashboard.manage", "policies.create", "policies.view", "reports.view"],
  },
  {
    slug: "employee",
    name: "Employee",
    description: "Standard employee",
    permissions: ["dashboard.manage", "reports.view", "policies.view"],
  },
  {
    slug: "ps",
    name: "Product Specialist",
    description: "Branch sales — create orders and transfers",
    permissions: [
      "dashboard.manage",
      "inventory.view",
      "orders.view",
      "orders.create",
      "sales.create",
      "planogram.view",
    ],
  },
  {
    slug: "tl",
    name: "Team Leader",
    description: "First-level order and transfer approval",
    permissions: [
      "dashboard.manage",
      "inventory.view",
      "orders.view",
      "orders.approve",
      "planogram.view",
    ],
  },
  {
    slug: "sp",
    name: "Sales Planner",
    description: "Planogram and SP order approval",
    permissions: [
      "dashboard.manage",
      "master_data.manage",
      "inventory.view",
      "orders.view",
      "orders.approve",
      "planogram.manage",
      "forecast.manage",
    ],
  },
  {
    slug: "logistics",
    name: "Logistics",
    description: "Delivery, transfer, pull-out processing",
    permissions: ["dashboard.manage", "inventory.view", "orders.view", "orders.approve", "logistics.manage"],
  },
  {
    slug: "ae",
    name: "Area Executive",
    description: "Multi-branch dashboard visibility",
    permissions: [
      "dashboard.manage",
      "inventory.view",
      "orders.view",
      "reports.view",
      "planogram.view",
    ],
  },
] as const;

export const DEPARTMENTS = ["Compliance", "Engineering", "Human Resources", "Operations"] as const;

export const USER_DEPARTMENTS: Record<string, (typeof DEPARTMENTS)[number]> = {
  "employee@demo.local": "Engineering",
  "depthead@demo.local": "Operations",
  "isms@demo.local": "Compliance",
  "auditor@demo.local": "Compliance",
  "admin@demo.local": "Human Resources",
  "ps@demo.local": "Operations",
  "tl@demo.local": "Operations",
  "sp@demo.local": "Operations",
  "logistics@demo.local": "Operations",
  "ae@demo.local": "Operations",
};

export type SeedProfile = "minimal" | "full" | "core" | "status" | "brs";

export function resolveSeedProfile(): SeedProfile {
  const raw = process.env.SEED_PROFILE?.trim().toLowerCase();
  if (raw === "full" || raw === "core" || raw === "status" || raw === "brs" || raw === "minimal") {
    return raw;
  }
  return "minimal";
}
