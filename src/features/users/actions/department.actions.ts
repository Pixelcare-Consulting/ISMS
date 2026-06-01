"use server";

import { revalidatePath } from "next/cache";

import { departmentService } from "@/features/users/services/department.service";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from "@/features/users/schemas/department.schema";
import { requirePermission } from "@/lib/auth/permissions";

export async function listDepartmentsManageAction() {
  const session = await requirePermission("users.manage");
  return departmentService.listDepartments(session.user.tenantId);
}

export async function createDepartmentAction(formData: FormData) {
  const session = await requirePermission("users.manage");
  const parsed = createDepartmentSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await departmentService.createDepartment({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      name: parsed.data.name,
    });
    revalidatePath("/settings/departments");
    revalidatePath("/settings/users");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to create department",
    };
  }
}

export async function updateDepartmentAction(formData: FormData) {
  const session = await requirePermission("users.manage");
  const parsed = updateDepartmentSchema.safeParse({
    departmentId: formData.get("departmentId"),
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await departmentService.updateDepartment({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/departments");
    revalidatePath("/settings/users");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update department",
    };
  }
}

export async function deleteDepartmentAction(departmentId: string) {
  const session = await requirePermission("users.manage");

  if (!departmentId) {
    return { error: "Department is required" };
  }

  try {
    await departmentService.deleteDepartment({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      departmentId,
    });
    revalidatePath("/settings/departments");
    revalidatePath("/settings/users");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to delete department",
    };
  }
}
