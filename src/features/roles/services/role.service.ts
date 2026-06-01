import { roleRepository } from "@/features/users/repositories/role.repository";
import { auditService } from "@/features/audit/services/audit.service";
import {
  filterTenantManageableRoles,
  filterTenantVisibleRoles,
  isProviderOnlyRole,
} from "@/features/roles/constants/role.constants";
import {
  createRoleSchema,
  resolveRoleSlug,
} from "@/features/roles/schemas/create-role.schema";
import { updateRoleSchema } from "@/features/roles/schemas/update-role.schema";
import type { RolesPermissionsMatrix } from "@/features/roles/types/role.types";

export const roleService = {
  async getPermissionsMatrix(
    tenantId: string,
    isPlatformOperator = false,
  ): Promise<RolesPermissionsMatrix> {
    const [roles, permissions] = await Promise.all([
      roleRepository.listByTenant(tenantId),
      roleRepository.listPermissions(),
    ]);

    const tenantRoles = isPlatformOperator
      ? filterTenantVisibleRoles(roles)
      : filterTenantManageableRoles(roles);

    return {
      roles: tenantRoles.map((role) => ({
        id: role.id,
        slug: role.slug,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        userCount: role._count.userRoles,
        permissionSlugs: role.rolePermissions.map((rp) => rp.permission.slug),
      })),
      permissions: permissions.map((permission) => ({
        id: permission.id,
        slug: permission.slug,
        name: permission.name,
      })),
    };
  },

  async createRole(input: {
    tenantId: string;
    actorUserId: string;
    name: string;
    description?: string | null;
    slug?: string;
  }) {
    const parsed = createRoleSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const slug = resolveRoleSlug(parsed.data);
    const existing = await roleRepository.findBySlug(input.tenantId, slug);
    if (existing) {
      throw new Error("A role with this slug already exists");
    }

    const role = await roleRepository.create({
      tenantId: input.tenantId,
      slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isSystem: false,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "role.created",
      entityType: "Role",
      entityId: role.id,
      metadata: { slug: role.slug, name: role.name },
    });

    return role;
  },

  async setRolePermission(input: {
    tenantId: string;
    actorUserId: string;
    roleId: string;
    permissionSlug: string;
    enabled: boolean;
    isPlatformOperator?: boolean;
  }) {
    const role = await roleRepository.findById(input.tenantId, input.roleId);
    if (!role) {
      throw new Error("Role not found");
    }

    if (isProviderOnlyRole(role.slug)) {
      throw new Error("This role cannot be modified");
    }

    const permission = await roleRepository.findPermissionBySlug(
      input.permissionSlug,
    );
    if (!permission) {
      throw new Error("Permission not found");
    }

    if (input.enabled) {
      await roleRepository.grantPermission(role.id, permission.id);
    } else {
      await roleRepository.revokePermission(role.id, permission.id);
    }

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: input.enabled ? "role.permission.granted" : "role.permission.revoked",
      entityType: "Role",
      entityId: role.id,
      metadata: {
        roleSlug: role.slug,
        permissionSlug: permission.slug,
      },
    });
  },

  async updateRole(input: {
    tenantId: string;
    actorUserId: string;
    roleId: string;
    name: string;
    description?: string | null;
    isPlatformOperator?: boolean;
  }) {
    const parsed = updateRoleSchema.safeParse({
      roleId: input.roleId,
      name: input.name,
      description: input.description,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const role = await roleRepository.findById(input.tenantId, input.roleId);
    if (!role) {
      throw new Error("Role not found");
    }

    if (isProviderOnlyRole(role.slug)) {
      throw new Error("This role cannot be modified");
    }

    if (!input.isPlatformOperator && role.isSystem) {
      throw new Error("This role cannot be modified");
    }

    const updatedRole = await roleRepository.update(input.tenantId, role.id, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "role.updated",
      entityType: "Role",
      entityId: role.id,
      metadata: { slug: role.slug, name: updatedRole.name },
    });

    return updatedRole;
  },

  async deleteRole(input: {
    tenantId: string;
    actorUserId: string;
    roleId: string;
  }) {
    const role = await roleRepository.findById(input.tenantId, input.roleId);
    if (!role) {
      throw new Error("Role not found");
    }

    if (isProviderOnlyRole(role.slug) || role.isSystem) {
      throw new Error("This role cannot be deleted");
    }

    const assignedUsers = await roleRepository.countUsers(role.id);
    if (assignedUsers > 0) {
      throw new Error("Remove users from this role before deleting it");
    }

    await roleRepository.softDelete(input.tenantId, role.id);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "role.deleted",
      entityType: "Role",
      entityId: role.id,
      metadata: { slug: role.slug, name: role.name },
    });
  },
};
