"use server";

import { revalidatePath } from "next/cache";
import { aorService } from "@/features/aors/services/aor.service";
import { branchService } from "@/features/branches/services/branch.service";
import { userService } from "@/features/users/services/user.service";
import { requirePermission } from "@/lib/auth/permissions";

export async function listAorsAction() {
  const session = await requirePermission("aors.manage");
  return aorService.listAors(session.user.tenantId);
}

export async function listAorFormOptionsAction() {
  const session = await requirePermission("aors.manage");
  const [users, branches] = await Promise.all([
    userService.listUsers(session.user.tenantId),
    branchService.listBranches(session.user.tenantId),
  ]);
  return { users, branches };
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
