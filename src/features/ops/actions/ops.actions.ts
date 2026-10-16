"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { opsService } from "@/features/ops/services/ops.service";
import { aorService } from "@/features/aors/services/aor.service";
import { branchService } from "@/features/branches/services/branch.service";
import {
  LOGISTICS_CREATE,
  LOGISTICS_MANAGE,
} from "@/features/logistics/constants/logistics-permissions";
import { hasPermission, requireAnyPermission, requirePermission } from "@/lib/auth/permissions";

const OPS_CREATE_PERMISSIONS = [LOGISTICS_CREATE, LOGISTICS_MANAGE, "orders.create"] as const;

const transferSchema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  modelId: z.string().min(1),
  quantity: z.number().int().positive(),
  serialNumberIds: z.array(z.string().min(1)).min(1),
  notes: z.string().optional(),
});

const pulloutSchema = z.object({
  branchId: z.string().min(1),
  warehouseId: z.string().min(1),
  reasonStatusCodeId: z.string().min(1),
  serialNumberIds: z.array(z.string().min(1)).min(1),
  notes: z.string().optional(),
});

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
    const delivery = await opsService.acceptDelivery({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      deliveryId,
    });
    revalidatePath("/operations");
    revalidatePath("/inventory");
    revalidatePath("/logistics/deliveries");
    return { success: true as const, movedCount: delivery.movedCount };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to accept delivery" };
  }
}

export async function rejectDeliveryAction(deliveryId: string) {
  const session = await requirePermission("inventory.view");
  try {
    await opsService.rejectDelivery({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      deliveryId,
    });
    revalidatePath("/operations");
    revalidatePath("/logistics/deliveries");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reject delivery" };
  }
}

export async function createTransferAction(input: unknown) {
  const session = await requireAnyPermission([...OPS_CREATE_PERMISSIONS]);
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose branches, a model, and the serials to transfer" };
  try {
    const row = await opsService.createTransfer(
      {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        permissions: session.user.permissions,
      },
      parsed.data,
    );
    revalidatePath("/operations");
    revalidatePath("/logistics/transfers");
    revalidatePath("/inventory");
    return { success: true as const, id: row.id, transferNo: row.transferNo };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create transfer" };
  }
}

export async function createPulloutAction(input: unknown) {
  const session = await requireAnyPermission([...OPS_CREATE_PERMISSIONS]);
  const parsed = pulloutSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a branch, warehouse, reason, and serials" };
  try {
    const row = await opsService.createPullout(
      {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        permissions: session.user.permissions,
      },
      parsed.data,
    );
    revalidatePath("/operations");
    revalidatePath("/logistics/pickups");
    revalidatePath("/inventory");
    return { success: true as const, id: row.id, pulloutNo: row.pulloutNo };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create pull-out" };
  }
}
