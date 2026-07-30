"use server";

import { revalidatePath } from "next/cache";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  inventoryService,
  type InventoryListOptions,
} from "@/features/inventory/services/inventory.service";
import type {
  InventoryListSort,
  InventoryListSortDir,
} from "@/features/inventory/repositories/inventory.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { decimalToNumberOrNull } from "@/lib/database/decimal";

function isUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

function parseSort(value?: string): InventoryListSort | undefined {
  if (value === "aging" || value === "dr" || value === "updatedAt") return value;
  return undefined;
}

function parseSortDir(value?: string): InventoryListSortDir | undefined {
  if (value === "asc" || value === "desc") return value;
  return undefined;
}

export async function listInventoryAction(input?: {
  page?: number;
  limit?: number;
  branchId?: string;
  sku?: string;
  statusCodeId?: string;
  offPlanogram?: boolean;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  const limit = parseTablePageSize(input?.limit);
  const filters: InventoryListOptions = {
    branchId: input?.branchId,
    skuCode: input?.sku,
    statusCodeId: input?.statusCodeId,
    offPlanogramOnly: input?.offPlanogram === true,
    sort: parseSort(input?.sort),
    sortDir: parseSortDir(input?.sortDir),
  };
  const result = await inventoryService.listForUser(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    { page: input?.page, limit },
    filters,
  );
  return {
    ...result,
    items: result.items.map((r) => ({
      ...r,
      branchId: r.branchId,
      onPlanogram: "onPlanogram" in r ? Boolean(r.onPlanogram) : false,
      deliveryNo: "deliveryNo" in r ? (r.deliveryNo as string | null) : null,
      deliveryDate:
        "deliveryDate" in r && r.deliveryDate instanceof Date
          ? r.deliveryDate.toISOString()
          : null,
      agingDays: "agingDays" in r ? Number(r.agingDays) : 0,
      createdAt: r.createdAt.toISOString(),
      branch: { ...r.branch, id: r.branchId },
      serialNumber: {
        id: r.serialNumber.id,
        serialNo: r.serialNumber.serialNo,
        model: {
          ...r.serialNumber.model,
          sku: r.serialNumber.model.skuCode,
          srp: decimalToNumberOrNull(r.serialNumber.model.srp),
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

export async function getInventorySeriesSummaryAction(input?: {
  branchId?: string;
  sku?: string;
  statusCodeId?: string;
  offPlanogram?: boolean;
}) {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  return inventoryService.getSeriesSummary(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    {
      branchId: input?.branchId,
      skuCode: input?.sku,
      statusCodeId: input?.statusCodeId,
      offPlanogramOnly: input?.offPlanogram === true,
    },
  );
}

export async function getInventoryKpisAction() {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  return inventoryService.getKpis(
    session.user.tenantId,
    session.user.id,
    unrestricted,
  );
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
