"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userService } from "@/features/users/services/user.service";
import { updateUserSchema } from "@/features/users/schemas/update-user.schema";
import {
  requireAuth,
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  roleSlug: z.string().min(1, "Role is required"),
  departmentId: z.string().optional(),
});

export async function listUsersAction() {
  const session = await requirePermission("users.manage");
  const isPlatformOperator = await resolveSessionPlatformOperator(session.user);
  return userService.listUsers(session.user.tenantId, isPlatformOperator);
}

export async function listRolesAction() {
  const session = await requireAuth();
  return userService.listRoles(session.user.tenantId);
}

export async function listDepartmentsAction() {
  const session = await requireAuth();
  return userService.listDepartments(session.user.tenantId);
}

export async function listRolesManageAction() {
  const session = await requirePermission("roles.manage");
  return userService.listRoles(session.user.tenantId);
}

export async function createUserAction(formData: FormData) {
  const session = await requirePermission("users.manage");
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    roleSlug: formData.get("roleSlug") || undefined,
    departmentId: formData.get("departmentId") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const user = await userService.createUser({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/users");
    return { success: true, user };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to create user",
    };
  }
}

export async function updateUserAction(formData: FormData) {
  const session = await requirePermission("users.manage");
  const parsed = updateUserSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    roleSlug: formData.get("roleSlug"),
    departmentId: formData.get("departmentId") || null,
    password: formData.get("password") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const user = await userService.updateUser({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
      departmentId: parsed.data.departmentId ?? null,
    });
    revalidatePath("/settings/users");
    revalidatePath("/dashboard");
    return { success: true, user };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update user",
    };
  }
}

export async function deleteUserAction(userId: string) {
  const session = await requirePermission("users.manage");

  if (!userId) {
    return { error: "User is required" };
  }

  try {
    await userService.deleteUser({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      userId,
    });
    revalidatePath("/settings/users");
    revalidatePath("/dashboard");
    return { success: true, userId };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to delete user",
    };
  }
}
