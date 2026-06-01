"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { roleService } from "@/features/roles/services/role.service";
import {
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
import {
  createRoleSchema,
  resolveRoleSlug,
} from "@/features/roles/schemas/create-role.schema";
import { updateRoleSchema } from "@/features/roles/schemas/update-role.schema";

const togglePermissionSchema = z.object({
  roleId: z.string().min(1),
  permissionSlug: z.string().min(1),
  enabled: z.boolean(),
});

export async function getRolesPermissionsMatrixAction() {
  const session = await requirePermission("roles.manage");
  const isPlatformOperator = await resolveSessionPlatformOperator(session.user);
  return roleService.getPermissionsMatrix(
    session.user.tenantId,
    isPlatformOperator,
  );
}

export async function toggleRolePermissionAction(input: {
  roleId: string;
  permissionSlug: string;
  enabled: boolean;
}) {
  const session = await requirePermission("roles.manage");
  const parsed = togglePermissionSchema.safeParse(input);

  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  try {
    const isPlatformOperator = await resolveSessionPlatformOperator(session.user);
    await roleService.setRolePermission({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      isPlatformOperator,
      ...parsed.data,
    });
    revalidatePath("/settings/roles");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update permission",
    };
  }
}

export async function createRoleAction(formData: FormData) {
  const session = await requirePermission("roles.manage");
  const parsed = createRoleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    slug: formData.get("slug") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    resolveRoleSlug(parsed.data);
    await roleService.createRole({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/roles");
    revalidatePath("/settings/users");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to create role",
    };
  }
}

export async function updateRoleAction(formData: FormData) {
  const session = await requirePermission("roles.manage");
  const parsed = updateRoleSchema.safeParse({
    roleId: formData.get("roleId"),
    name: formData.get("name"),
    description: formData.get("description") || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const isPlatformOperator = await resolveSessionPlatformOperator(session.user);
    await roleService.updateRole({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      isPlatformOperator,
      ...parsed.data,
    });
    revalidatePath("/settings/roles");
    revalidatePath("/settings/users");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update role",
    };
  }
}

export async function deleteRoleAction(roleId: string) {
  const session = await requirePermission("roles.manage");

  if (!roleId) {
    return { error: "Role is required" };
  }

  try {
    await roleService.deleteRole({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      roleId,
    });
    revalidatePath("/settings/roles");
    revalidatePath("/settings/users");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to delete role",
    };
  }
}
