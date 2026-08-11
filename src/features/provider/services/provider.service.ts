import bcrypt from "bcryptjs";

import { auditService } from "@/features/audit/services/audit.service";
import type {
  CreateProviderCustomerUserInput,
  CreateTenantWithAdminInput,
  DeleteProviderCustomerUserInput,
  UpdateProviderCustomerBrandingInput,
  UpdateProviderCustomerUserInput,
} from "@/features/provider/schemas/provider.schema";
import { bootstrapCustomerTenant } from "@/features/tenants/services/bootstrap-customer-tenant";
import { tenantService } from "@/features/tenants/services/tenant.service";
import { roleRepository } from "@/features/users/repositories/role.repository";
import { userRepository } from "@/features/users/repositories/user.repository";
import { userService } from "@/features/users/services/user.service";
import { syncCredentialAccountPassword } from "@/lib/auth/auth";
import { prisma } from "@/lib/database/client";

export type ProviderCustomerListItem = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  deletedAt: Date | null;
  userCount: number;
  status: "active" | "disabled";
};

export type ProviderTenantDetail = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  logo: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  status: "active" | "disabled";
  userCount: number;
  roleCount: number;
};

async function assertCustomerTenant(tenantId: string) {
  const tenant = await tenantService.getByIdIncludingDisabled(tenantId);
  if (!tenant || tenant.isPlatform) {
    throw new Error("Customer organization not found");
  }
  return tenant;
}

function assertTenantWritable(tenant: { deletedAt: Date | null }) {
  if (tenant.deletedAt) {
    throw new Error(
      "Organization is disabled. Restore it before making changes.",
    );
  }
}

export const providerService = {
  getSummary() {
    return tenantService.getSummaryCounts();
  },

  async listCustomers(): Promise<ProviderCustomerListItem[]> {
    const tenants = await tenantService.listCustomers();
    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.createdAt,
      deletedAt: tenant.deletedAt,
      userCount: tenant._count.users,
      status: tenant.deletedAt ? ("disabled" as const) : ("active" as const),
    }));
  },

  async getCustomerDetail(tenantId: string): Promise<ProviderTenantDetail | null> {
    const tenant = await tenantService.getByIdIncludingDisabled(tenantId);
    if (!tenant || tenant.isPlatform) {
      return null;
    }

    const [userCount, roleCount] = await Promise.all([
      prisma.user.count({
        where: { tenantId, deletedAt: null },
      }),
      prisma.role.count({
        where: { tenantId, deletedAt: null },
      }),
    ]);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      tagline: tenant.tagline,
      logo: tenant.logo,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      deletedAt: tenant.deletedAt,
      status: tenant.deletedAt ? "disabled" : "active",
      userCount,
      roleCount,
    };
  },

  async createCustomerWithAdmin(
    actorUserId: string,
    input: CreateTenantWithAdminInput,
  ) {
    const tenant = await tenantService.createOrganization(input.organizationName);
    await bootstrapCustomerTenant(tenant.id);

    const passwordHash = await bcrypt.hash(input.adminPassword, 12);
    const user = await userRepository.create({
      tenantId: tenant.id,
      email: input.adminEmail,
      name: input.adminName,
      passwordHash,
    });
    await syncCredentialAccountPassword(user.id, passwordHash);

    const adminRole = await roleRepository.findBySlug(tenant.id, "tenant_admin");
    if (adminRole) {
      await userRepository.assignRole(user.id, adminRole.id);
    }

    await auditService.log({
      tenantId: tenant.id,
      userId: actorUserId,
      action: "tenant.created",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: {
        slug: tenant.slug,
        adminEmail: user.email,
        adminUserId: user.id,
      },
    });

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      admin: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  },

  disableCustomer(tenantId: string, actorUserId: string) {
    return tenantService.softDeleteCustomer(tenantId, actorUserId);
  },

  restoreCustomer(tenantId: string, actorUserId: string) {
    return tenantService.restoreCustomer(tenantId, actorUserId);
  },

  async updateCustomerBranding(
    actorUserId: string,
    input: UpdateProviderCustomerBrandingInput,
  ) {
    const tenant = await assertCustomerTenant(input.tenantId);
    assertTenantWritable(tenant);

    const logo =
      input.logo === undefined
        ? undefined
        : input.logo == null || input.logo.trim() === ""
          ? null
          : input.logo.trim();

    return tenantService.updateBranding(input.tenantId, actorUserId, {
      name: input.name,
      tagline: input.tagline,
      ...(logo !== undefined ? { logo } : {}),
    });
  },

  async listCustomerUsers(tenantId: string) {
    await assertCustomerTenant(tenantId);

    const [users, roles, departments] = await Promise.all([
      userService.listUsers(tenantId, false),
      userService.listRoles(tenantId),
      userService.listDepartments(tenantId),
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        userRoles: user.userRoles.map((userRole) => ({
          role: {
            slug: userRole.role.slug,
            name: userRole.role.name,
          },
        })),
        department: user.department
          ? { id: user.department.id, name: user.department.name }
          : null,
      })),
      roles: roles.map((role) => ({
        slug: role.slug,
        name: role.name,
      })),
      departments: departments.map((department) => ({
        id: department.id,
        name: department.name,
      })),
    };
  },

  async createCustomerUser(
    actorUserId: string,
    input: CreateProviderCustomerUserInput,
  ) {
    const tenant = await assertCustomerTenant(input.tenantId);
    assertTenantWritable(tenant);

    return userService.createUser({
      tenantId: input.tenantId,
      actorUserId,
      email: input.email,
      name: input.name,
      password: input.password,
      roleSlug: input.roleSlug,
      departmentId: input.departmentId ?? null,
    });
  },

  async updateCustomerUser(
    actorUserId: string,
    input: UpdateProviderCustomerUserInput,
  ) {
    const tenant = await assertCustomerTenant(input.tenantId);
    assertTenantWritable(tenant);

    return userService.updateUser({
      tenantId: input.tenantId,
      actorUserId,
      userId: input.userId,
      name: input.name,
      roleSlug: input.roleSlug,
      departmentId: input.departmentId ?? null,
      password: input.password,
    });
  },

  async deleteCustomerUser(
    actorUserId: string,
    input: DeleteProviderCustomerUserInput,
  ) {
    const tenant = await assertCustomerTenant(input.tenantId);
    assertTenantWritable(tenant);

    await userService.deleteUser({
      tenantId: input.tenantId,
      actorUserId,
      userId: input.userId,
    });
  },
};
