import { auditService } from "@/features/audit/services/audit.service";
import { isProtectedPermission } from "@/features/permissions/constants/permission.constants";
import { permissionRepository } from "@/features/permissions/repositories/permission.repository";
import { createPermissionSchema } from "@/features/permissions/schemas/create-permission.schema";
import { updatePermissionSchema } from "@/features/permissions/schemas/update-permission.schema";
import type { PermissionRow } from "@/features/permissions/types/permission.types";
import { parsePermissionSlug } from "@/config/app-modules";

function mapPermissionRow(
  permission: Awaited<
    ReturnType<typeof permissionRepository.listWithStats>
  >[number],
): PermissionRow {
  const { module, action } = parsePermissionSlug(permission.slug);

  return {
    id: permission.id,
    slug: permission.slug,
    name: permission.name,
    description: permission.description,
    roleCount: permission._count.rolePermissions,
    isProtected: isProtectedPermission(permission.slug),
    moduleId: module?.id ?? null,
    moduleName: module?.name ?? null,
    moduleRoute: module?.route ?? null,
    action,
    isLinked: module !== null,
  };
}

export const permissionService = {
  async listPermissions(): Promise<PermissionRow[]> {
    const permissions = await permissionRepository.listWithStats();
    return permissions.map(mapPermissionRow);
  },

  async createPermission(input: {
    tenantId: string;
    actorUserId: string;
    name: string;
    moduleId: string;
    action: string;
    description?: string | null;
  }) {
    const parsed = createPermissionSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await permissionRepository.findBySlug(parsed.data.slug);
    if (existing) {
      throw new Error("A permission with this slug already exists");
    }

    const permission = await permissionRepository.create({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "permission.created",
      entityType: "Permission",
      entityId: permission.id,
      metadata: { slug: permission.slug, name: permission.name },
    });

    return permission;
  },

  async updatePermission(input: {
    tenantId: string;
    actorUserId: string;
    permissionId: string;
    name: string;
    description?: string | null;
  }) {
    const parsed = updatePermissionSchema.safeParse({
      permissionId: input.permissionId,
      name: input.name,
      description: input.description,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const permission = await permissionRepository.findById(parsed.data.permissionId);
    if (!permission) {
      throw new Error("Permission not found");
    }

    const updated = await permissionRepository.update(permission.id, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "permission.updated",
      entityType: "Permission",
      entityId: permission.id,
      metadata: { slug: permission.slug, name: updated.name },
    });

    return updated;
  },

  async deletePermission(input: {
    tenantId: string;
    actorUserId: string;
    permissionId: string;
  }) {
    const permission = await permissionRepository.findById(input.permissionId);
    if (!permission) {
      throw new Error("Permission not found");
    }

    if (isProtectedPermission(permission.slug)) {
      throw new Error("This permission is protected and cannot be deleted");
    }

    if (permission._count.rolePermissions > 0) {
      throw new Error(
        "Remove this permission from all roles before deleting it",
      );
    }

    await permissionRepository.delete(permission.id);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "permission.deleted",
      entityType: "Permission",
      entityId: permission.id,
      metadata: { slug: permission.slug, name: permission.name },
    });
  },
};
