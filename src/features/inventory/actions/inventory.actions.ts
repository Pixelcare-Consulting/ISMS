"use server";

import { revalidatePath } from "next/cache";
import { inventoryService } from "@/features/inventory/services/inventory.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";

function isUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

export async function listInventoryAction(input?: {
  page?: number;
  branchId?: string;
  sku?: string;
  offPlanogram?: boolean;
}) {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  const result = await inventoryService.listForUser(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    { page: input?.page },
    {
      branchId: input?.branchId,
      skuCode: input?.sku,
      offPlanogramOnly: input?.offPlanogram === true,
    },
  );
  return {
    ...result,
    items: result.items.map((r) => ({
      ...r,
      branchId: r.branchId,
      onPlanogram: "onPlanogram" in r ? Boolean(r.onPlanogram) : false,
      branch: { ...r.branch, id: r.branchId },
      serialNumber: {
        ...r.serialNumber,
        model: {
          ...r.serialNumber.model,
          sku: r.serialNumber.model.skuCode,
          brand: r.serialNumber.model.brand ?? { name: "—" },
        },
      },
    })),
  };
}

export async function listInventoryStatusOptionsAction() {
  const session = await requirePermission("inventory.view");
  return reasonStatusService.listActiveCodes(session.user.tenantId, "inventory_system");
}

export async function updateInventoryStatusAction(
  inventoryId: string,
  statusCodeId: string,
) {
  const session = await requirePermission("inventory.view");
  try {
    await inventoryService.updateStatus({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      inventoryId,
      statusCodeId,
    });
    revalidatePath("/inventory");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update status" };
  }
}

