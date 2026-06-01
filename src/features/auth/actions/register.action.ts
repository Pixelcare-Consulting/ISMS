"use server";

import bcrypt from "bcryptjs";

import { auditService } from "@/features/audit/services/audit.service";
import { registerSchema } from "@/features/auth/schemas/auth.schema";
import { DEFAULT_DEPARTMENT_NAMES } from "@/features/users/constants/department.constants";
import { departmentService } from "@/features/users/services/department.service";
import { tenantService } from "@/features/tenants/services/tenant.service";
import { roleRepository } from "@/features/users/repositories/role.repository";
import { userRepository } from "@/features/users/repositories/user.repository";
import { prisma } from "@/lib/database/client";

const SYSTEM_ROLES = [
  { slug: "tenant_admin", name: "Tenant Admin", description: "Tenant administrator" },
  { slug: "isms_manager", name: "ISMS Manager", description: "ISMS program manager" },
  { slug: "auditor", name: "Auditor", description: "Internal auditor" },
  { slug: "dept_head", name: "Department Head", description: "Department head" },
  { slug: "employee", name: "Employee", description: "Standard employee" },
] as const;

async function seedTenantRoles(tenantId: string) {
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

  const matrix: Record<string, string[]> = {
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

    const slugs = matrix[roleDef.slug] ?? [];
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

export async function registerAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
) {
  const raw = {
    organizationName: formData.get("organizationName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { organizationName, name, email, password } = parsed.data;

  try {
    const tenant = await tenantService.createOrganization(organizationName);
    await seedTenantRoles(tenant.id);
    await departmentService.seedDefaultDepartments(
      tenant.id,
      DEFAULT_DEPARTMENT_NAMES,
    );

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userRepository.create({
      tenantId: tenant.id,
      email,
      name,
      passwordHash,
    });

    const adminRole = await roleRepository.findBySlug(tenant.id, "tenant_admin");
    if (adminRole) {
      await userRepository.assignRole(user.id, adminRole.id);
    }

    await auditService.log({
      tenantId: tenant.id,
      userId: user.id,
      action: "tenant.registered",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { slug: tenant.slug },
    });

    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Registration failed",
    };
  }
}
