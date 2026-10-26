"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { opsService } from "@/features/ops/services/ops.service";
import { aorService } from "@/features/aors/services/aor.service";
import { branchService } from "@/features/branches/services/branch.service";
import {
  LOGISTICS_CREATE,
  LOGISTICS_DELIVERY_RETURN_APPROVE,
  LOGISTICS_DELIVERY_RETURN_REQUEST,
  LOGISTICS_MANAGE,
} from "@/features/logistics/constants/logistics-permissions";
import {
  resolveLogisticsBranchScope,
  transferListWhere,
} from "@/features/logistics/lib/transfer-visibility";
import {
  deliveryReturnCancelNoteSchema,
  deliveryReturnDecisionSchema,
  deliveryReturnReasonSchema,
  type DeliveryReturnDetail,
} from "@/features/logistics/services/delivery-return.service";
import { hasPermission, requireAnyPermission, requirePermission } from "@/lib/auth/permissions";

const OPS_CREATE_PERMISSIONS = [LOGISTICS_CREATE, LOGISTICS_MANAGE, "orders.create"] as const;

const transferSchema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  modelId: z.string().min(1),
  quantity: z.number().int().positive(),
  serialNumberIds: z.array(z.string().min(1)).min(1),
  notes: z.string().optional(),
  transferNo: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((value) => value || undefined),
});

const checklistIdList = z.array(z.string().min(1)).min(1);
const pulloutLineSchema = z.object({
  serialNumberId: z.string().min(1),
  pulloutClassificationIds: checklistIdList,
  unitPackingConditionIds: checklistIdList,
  accessoryCompletenessIds: checklistIdList,
});
const pulloutSchema = z.object({
  branchId: z.string().min(1),
  warehouseId: z.string().min(1),
  reasonStatusCodeId: z.string().min(1),
  lines: z.array(pulloutLineSchema).min(1),
  notes: z.string().optional(),
});

const serialIdsSchema = z.object({
  serialNumberIds: z.array(z.string().min(1)).min(1).optional(),
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
  const where = transferListWhere(
    await resolveLogisticsBranchScope({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      permissions: session.user.permissions,
    }),
  );
  return opsService.listTransfers(session.user.tenantId, where);
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

export async function listDeliveryReceiptLinesAction(deliveryId: string) {
  const session = await requirePermission("inventory.view");
  try {
    const result = await opsService.listDeliveryReceiptLines(
      {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        permissions: session.user.permissions,
      },
      deliveryId,
    );
    return { success: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load delivery serials" };
  }
}

export async function acceptDeliveryAction(deliveryId: string, input?: unknown) {
  const session = await requirePermission("inventory.view");
  const parsed = input ? serialIdsSchema.safeParse(input) : { success: true as const, data: {} };
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const delivery = await opsService.acceptDelivery({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      permissions: session.user.permissions,
      deliveryId,
      serialNumberIds: parsed.data.serialNumberIds,
    });
    revalidatePath("/operations");
    revalidatePath("/inventory");
    revalidatePath("/logistics/deliveries");
    return { success: true as const, movedCount: delivery.movedCount, status: delivery.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to accept delivery" };
  }
}

function opsActor(session: { user: { id: string; tenantId: string; permissions?: string[] } }) {
  return { tenantId: session.user.tenantId, userId: session.user.id, permissions: session.user.permissions };
}

function revalidateDeliveryReturn() {
  revalidatePath("/operations");
  revalidatePath("/logistics/deliveries");
  revalidatePath("/inventory");
}

export async function requestDeliveryReturnAction(deliveryId: string, reason: unknown) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_RETURN_REQUEST]);
  const parsed = deliveryReturnReasonSchema.safeParse(reason);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter the reason for the return" };
  try {
    const row = await opsService.requestDeliveryReturn(opsActor(session), { deliveryId, reason: parsed.data });
    revalidateDeliveryReturn();
    return { success: true as const, id: row.id, requestNo: row.requestNo };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to request the return" };
  }
}

export async function getDeliveryReturnAction(
  deliveryId: string,
): Promise<{ success: true; detail: DeliveryReturnDetail | null } | { error: string }> {
  const session = await requirePermission("inventory.view");
  try {
    const detail = await opsService.getDeliveryReturn(opsActor(session), deliveryId);
    return { success: true as const, detail };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load the return request" };
  }
}

export async function decideDeliveryReturnAction(returnId: string, input: unknown) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_RETURN_APPROVE]);
  const parsed = deliveryReturnDecisionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const outcome = await opsService.decideDeliveryReturn(
      opsActor(session),
      returnId,
      parsed.data.action,
      parsed.data.note,
    );
    revalidateDeliveryReturn();
    return { success: true as const, ...outcome };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to decide the return request" };
  }
}

export async function cancelDeliveryReturnAction(returnId: string, note: unknown) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_RETURN_APPROVE]);
  const parsed = deliveryReturnCancelNoteSchema.safeParse(note);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter the reason for cancelling the return" };
  try {
    const outcome = await opsService.cancelDeliveryReturn(opsActor(session), returnId, parsed.data);
    revalidateDeliveryReturn();
    return { success: true as const, ...outcome };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to cancel the return" };
  }
}

export async function retryDeliveryReturnSapAction(returnId: string) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_RETURN_REQUEST, LOGISTICS_DELIVERY_RETURN_APPROVE]);
  try {
    const outcome = await opsService.retryDeliveryReturnSap(opsActor(session), returnId);
    revalidateDeliveryReturn();
    return { success: true as const, ...outcome };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to retry the SAP posting" };
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
  if (!parsed.success) {
    return {
      error:
        "Choose a branch, warehouse, reason, and classification, packing, and accessories for each serial",
    };
  }
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
