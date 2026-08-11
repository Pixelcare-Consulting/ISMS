import { DEFAULT_DEPARTMENT_NAMES } from "@/features/users/constants/department.constants";
import { departmentService } from "@/features/users/services/department.service";
import { prisma } from "@/lib/database/client";

const SYSTEM_ROLES = [
  { slug: "tenant_admin", name: "Tenant Admin", description: "Tenant administrator" },
  { slug: "isms_manager", name: "ISMS Manager", description: "ISMS program manager" },
  { slug: "auditor", name: "Auditor", description: "Internal auditor" },
  { slug: "dept_head", name: "Department Head", description: "Department head" },
  { slug: "employee", name: "Employee", description: "Standard employee" },
] as const;

const ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  tenant_admin: [
    "company.manage",
    "users.manage",
    "roles.manage",
    "policies.create",
    "policies.approve",
    "audits.create",
    "audits.close",
    "reports.view",
  ],
  isms_manager: [
    "users.manage",
    "policies.create",
    "policies.approve",
    "audits.create",
    "audits.close",
    "reports.view",
  ],
  auditor: ["audits.create", "audits.close", "reports.view", "policies.view"],
  dept_head: ["policies.create", "policies.view", "reports.view"],
  employee: ["reports.view", "policies.view"],
};

async function ensureMinimalPermissions() {
  let permissions = await prisma.permission.findMany();
  if (permissions.length === 0) {
    const defs = [
      { slug: "company.manage", name: "Manage company settings" },
      { slug: "users.manage", name: "Manage users" },
      { slug: "roles.manage", name: "Manage roles" },
      { slug: "policies.view", name: "View policies" },
      { slug: "policies.create", name: "Create policies" },
      { slug: "policies.approve", name: "Approve policies" },
      { slug: "audits.create", name: "Create audits" },
      { slug: "audits.close", name: "Close audits" },
      { slug: "reports.view", name: "View reports" },
    ];
    for (const d of defs) {
      await prisma.permission.upsert({
        where: { slug: d.slug },
        create: d,
        update: {},
      });
    }
    permissions = await prisma.permission.findMany();
  }
  return permissions;
}

async function seedTenantRoles(tenantId: string) {
  const permissions = await ensureMinimalPermissions();
  const permissionBySlug = Object.fromEntries(
    permissions.map((p) => [p.slug, p]),
  );

  for (const roleDef of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_slug: { tenantId, slug: roleDef.slug } },
      create: {
        tenantId,
        slug: roleDef.slug,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
      },
      update: {},
    });

    const slugs = ROLE_PERMISSION_MATRIX[roleDef.slug] ?? [];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const slug of slugs) {
      const permission = permissionBySlug[slug];
      if (!permission) continue;
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
}

/**
 * Seeds system roles, permission matrix, and default departments for a new customer tenant.
 * Used by public register (when enabled) and the Provider Dashboard create flow.
 */
export async function bootstrapCustomerTenant(tenantId: string) {
  await seedTenantRoles(tenantId);
  await departmentService.seedDefaultDepartments(
    tenantId,
    DEFAULT_DEPARTMENT_NAMES,
  );
}
