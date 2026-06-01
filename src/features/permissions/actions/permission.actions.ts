"use server";

import { revalidatePath } from "next/cache";

import { permissionService } from "@/features/permissions/services/permission.service";
import {
  requirePlatformOperator,
} from "@/lib/auth/permissions";
import { createPermissionSchema } from "@/features/permissions/schemas/create-permission.schema";
import { updatePermissionSchema } from "@/features/permissions/schemas/update-permission.schema";

const PERMISSIONS_PATH = "/settings/permissions";
const ROLES_PATH = "/settings/roles";

function revalidatePermissionPages() {
  revalidatePath(PERMISSIONS_PATH);
  revalidatePath(ROLES_PATH);
}

export async function listPermissionsAction() {
  await requirePlatformOperator();
  return permissionService.listPermissions();
}

export async function createPermissionAction(formData: FormData) {
  const session = await requirePlatformOperator();
  const parsed = createPermissionSchema.safeParse({
    name: formData.get("name"),
    moduleId: formData.get("moduleId"),
    action: formData.get("action"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await permissionService.createPermission({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePermissionPages();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to create permission",
    };
  }
}

export async function updatePermissionAction(formData: FormData) {
  const session = await requirePlatformOperator();
  const parsed = updatePermissionSchema.safeParse({
    permissionId: formData.get("permissionId"),
    name: formData.get("name"),
    description: formData.get("description") || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await permissionService.updatePermission({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePermissionPages();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update permission",
    };
  }
}

export async function deletePermissionAction(permissionId: string) {
  const session = await requirePlatformOperator();

  if (!permissionId) {
    return { error: "Permission is required" };
  }

  try {
    await permissionService.deletePermission({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      permissionId,
    });
    revalidatePermissionPages();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to delete permission",
    };
  }
}
