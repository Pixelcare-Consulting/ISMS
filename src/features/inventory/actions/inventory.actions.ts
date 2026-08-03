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
import type { PaginatedResult } from "@/lib/shared/pagination";

/** DTO row returned by listInventoryAction (ISO dates, sku alias). */
export type InventoryListItem = {
  id: string;
  onPlanogram: boolean;
  deliveryNo: string | null;
  deliveryDate: string | null;
  agingDays: number;
  statusCode: { id: string; code: string; name: string; color: string | null };
  branch: { id: string; name: string; sapCode: string };
  serialNumber: {
    id: string;
    serialNo: string;
    model: { sku: string; name: string; brand: { name: string } };
  };
};

export type InventoryStatusOption = {
  id: string;
  code: string;
  name: string;
};

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
}): Promise<PaginatedResult<InventoryListItem>> {
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
    items: result.items.map(
      (r): InventoryListItem => ({
        id: r.id,
        onPlanogram: r.onPlanogram,
        deliveryNo: r.deliveryNo,
        deliveryDate: r.deliveryDate ? r.deliveryDate.toISOString() : null,
        agingDays: r.agingDays,
        statusCode: {
          id: r.statusCode.id,
          code: r.statusCode.code,
          name: r.statusCode.name,
          color: r.statusCode.color,
        },
        branch: {
          id: r.branch.id,
          name: r.branch.name,
          sapCode: r.branch.sapCode,
        },
        serialNumber: {
          id: r.serialNumber.id,
          serialNo: r.serialNumber.serialNo,
          model: {
            sku: r.serialNumber.model.skuCode,
            name: r.serialNumber.model.name,
            brand: r.serialNumber.model.brand ?? { name: "—" },
          },
        },
      }),
    ),
  };
}

export async function listInventoryStatusOptionsAction(): Promise<
  InventoryStatusOption[]
> {
  const session = await requirePermission("inventory.view");
  const codes = await reasonStatusService.listActiveCodes(
    session.user.tenantId,
    "inventory_system",
  );
  return (codes as Array<{ id: string; code: string; name: string }>).map(
    (c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
    }),
  );
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
