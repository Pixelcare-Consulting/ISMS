"use server";

import { revalidatePath } from "next/cache";
import { opsService } from "@/features/ops/services/ops.service";
import { aorService } from "@/features/aors/services/aor.service";
import { branchService } from "@/features/branches/services/branch.service";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";

async function resolveBranchIds(session: {
  user: { id: string; tenantId: string; permissions?: string[] };
}) {
  const unrestricted = hasPermission(session.user.permissions, "branches.manage");
  if (unrestricted) return undefined;
  return aorService.getBranchIdsForUser(session.user.tenantId, session.user.id);
}

export async function listDeliveriesAction() {
  const session = await requirePermission("inventory.view");
  const branchIds = await resolveBranchIds(session);
  if (Array.isArray(branchIds) && branchIds.length === 0) return [];
  return opsService.listDeliveries(session.user.tenantId, branchIds);
}

export async function listTransfersAction() {
  const session = await requirePermission("inventory.view");
  return opsService.listTransfers(session.user.tenantId);
}

export async function listPulloutsAction() {
  const session = await requirePermission("inventory.view");
  const branchIds = await resolveBranchIds(session);
  if (Array.isArray(branchIds) && branchIds.length === 0) return [];
  return opsService.listPullouts(session.user.tenantId, branchIds);
}

export async function listOpsBranchOptionsAction() {
  const session = await requirePermission("inventory.view");
  const branchIds = await resolveBranchIds(session);
  const all = await branchService.listBranches(session.user.tenantId);
  const branches =
    branchIds && branchIds.length > 0
      ? all.filter((b) => branchIds.includes(b.id))
      : all;
  return branches;
}

export async function acceptDeliveryAction(deliveryId: string) {
  const session = await requirePermission("inventory.view");
  try {
    await opsService.acceptDelivery({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      deliveryId,
    });
    revalidatePath("/operations");
    revalidatePath("/inventory");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to accept delivery" };
  }
}

export async function createTransferAction(formData: FormData) {
  const session = await requirePermission("orders.create");
  try {
    await opsService.createTransfer({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      fromBranchId: String(formData.get("fromBranchId") ?? ""),
      toBranchId: String(formData.get("toBranchId") ?? ""),
      notes: (formData.get("notes") as string) || undefined,
    });
    revalidatePath("/operations");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create transfer" };
  }
}

export async function createPulloutAction(formData: FormData) {
  const session = await requirePermission("orders.create");
  try {
    await opsService.createPullout({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      branchId: String(formData.get("branchId") ?? ""),
      warehouseId: String(formData.get("warehouseId") ?? ""),
      notes: (formData.get("notes") as string) || undefined,
    });
    revalidatePath("/operations");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create pull-out" };
  }
}
