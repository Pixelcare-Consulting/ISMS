import bcrypt from "bcryptjs";
import { createPrismaClient } from "../src/lib/database/create-prisma-client";
import { seedBrsDemoData } from "./seed-brs";
import { seedReasonStatusesForTenant } from "./seed-reason-status";

const prisma = createPrismaClient();

/** Shared dev password — documented in database/seed-users.md */
const DEMO_PASSWORD = "DemoPass123";

const DEMO_USERS = [
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

const PERMISSIONS = [
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
] as const;

const ROLES = [
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

const DEPARTMENTS = ["Compliance", "Engineering", "Human Resources", "Operations"] as const;

const USER_DEPARTMENTS: Record<string, (typeof DEPARTMENTS)[number]> = {
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

async function main() {
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { slug: perm.slug },
      create: perm,
      update: { name: perm.name },
    });
  }

  const permissionRecords = await prisma.permission.findMany();
  const permissionBySlug = Object.fromEntries(permissionRecords.map((p) => [p.slug, p]));

  const demoTenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    create: {
      name: "Western Appliance Trade Group",
      slug: "demo",
      tagline: "BRS inventory ops + ISMS compliance",
    },
    update: {
      name: "Western Appliance Trade Group",
      tagline: "BRS inventory ops + ISMS compliance",
    },
  });

  const rolesBySlug: Record<string, { id: string }> = {};
  const departmentsByName: Record<string, { id: string }> = {};

  for (const departmentName of DEPARTMENTS) {
    const department = await prisma.department.upsert({
      where: { tenantId_name: { tenantId: demoTenant.id, name: departmentName } },
      create: { tenantId: demoTenant.id, name: departmentName },
      update: {},
    });
    departmentsByName[departmentName] = department;
  }

  for (const roleDef of ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_slug: { tenantId: demoTenant.id, slug: roleDef.slug } },
      create: {
        tenantId: demoTenant.id,
        slug: roleDef.slug,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
      },
      update: { name: roleDef.name, description: roleDef.description },
    });
    rolesBySlug[roleDef.slug] = role;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permSlug of roleDef.permissions) {
      const permission = permissionBySlug[permSlug];
      if (!permission) continue;
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const usersByEmail: Record<string, { id: string }> = {};

  for (const userDef of DEMO_USERS) {
    const departmentName = USER_DEPARTMENTS[userDef.email];
    const department = departmentName ? departmentsByName[departmentName] : undefined;

    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: demoTenant.id, email: userDef.email } },
      create: {
        tenantId: demoTenant.id,
        email: userDef.email,
        name: userDef.name,
        passwordHash,
        emailVerified: new Date(),
        departmentId: department?.id ?? null,
      },
      update: { name: userDef.name, passwordHash, departmentId: department?.id ?? null },
    });
    usersByEmail[userDef.email] = user;

    const role = rolesBySlug[userDef.roleSlug];
    if (!role) continue;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
  }

  const psUser = usersByEmail["ps@demo.local"];
  if (psUser) {
    await seedReasonStatusesForTenant(prisma, demoTenant.id);
    await seedBrsDemoData(prisma, demoTenant.id, usersByEmail);
  }

  console.log(
    "Seed complete: permissions, Western demo tenant, BRS roles, planogram/MIL demo data. See database/seed-users.md",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
