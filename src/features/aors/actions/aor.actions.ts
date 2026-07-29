"use server";

import { revalidatePath } from "next/cache";
import { aorService } from "@/features/aors/services/aor.service";
import { branchService } from "@/features/branches/services/branch.service";
import { dealerRepository } from "@/features/dealers/repositories/dealer.repository";
import { userService } from "@/features/users/services/user.service";
import { warehouseService } from "@/features/warehouses/services/warehouse.service";
import { requirePermission } from "@/lib/auth/permissions";

function formDataStringList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}

export async function listAorsAction() {
  const session = await requirePermission("aors.manage");
  return aorService.listAors(session.user.tenantId);
}

export async function listAorFormOptionsAction() {
  const session = await requirePermission("aors.manage");
  const [users, branches, dealers, warehouses] = await Promise.all([
    userService.listUsers(session.user.tenantId),
    branchService.listBranches(session.user.tenantId),
    dealerRepository.listActiveByTenant(session.user.tenantId),
    warehouseService.listWarehouses(session.user.tenantId),
  ]);
  return { users, branches, dealers, warehouses };
}

export async function createAorAction(formData: FormData) {
  const session = await requirePermission("aors.manage");
  try {
    const aor = await aorService.createAor({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      userId: String(formData.get("userId") ?? ""),
      branchId: (formData.get("branchId") as string) || null,
      warehouseId: (formData.get("warehouseId") as string) || null,
    });
    revalidatePath("/settings/aors");
    return { success: true, aor };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to assign AOR" };
  }
}

export async function createAorsBulkAction(formData: FormData) {
  const session = await requirePermission("aors.manage");
  try {
    const result = await aorService.createAorsBulk({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      userId: String(formData.get("userId") ?? ""),
      branchIds: formDataStringList(formData, "branchIds"),
      dealerIds: formDataStringList(formData, "dealerIds"),
    });
    revalidatePath("/settings/aors");
    return {
      success: true as const,
      aors: result.aors,
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to assign AORs" };
  }
}

export async function syncUserAorsAction(formData: FormData) {
  const session = await requirePermission("aors.manage");
  try {
    const result = await aorService.syncUserAors({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      userId: String(formData.get("userId") ?? ""),
      branchIds: formDataStringList(formData, "branchIds"),
      dealerIds: formDataStringList(formData, "dealerIds"),
      warehouseIds: formDataStringList(formData, "warehouseIds"),
    });
    revalidatePath("/settings/aors");
    return {
      success: true as const,
      aors: result.aors,
      createdCount: result.createdCount,
      deletedCount: result.deletedCount,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to sync AORs" };
  }
}

export async function deleteAorAction(aorId: string) {
  const session = await requirePermission("aors.manage");
  try {
    await aorService.deleteAor({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      aorId,
    });
    revalidatePath("/settings/aors");
    return { success: true, aorId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to remove AOR" };
  }
}
