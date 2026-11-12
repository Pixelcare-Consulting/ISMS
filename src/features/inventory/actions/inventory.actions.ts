"use server";

import { revalidatePath } from "next/cache";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import type {
  StockUnitsGroupBy,
  StockUnitsGroupChildLevel,
} from "@/features/inventory/constants/stock-units-group";
import {
  inventoryService,
  type InventoryGroupBranchInModelSummary,
  type InventoryGroupListOptions,
  type InventoryGroupWarehouseSummary,
  type InventoryListOptions,
} from "@/features/inventory/services/inventory.service";
import type { InventoryGroupAggregates } from "@/features/inventory/utils/stock-units-group-aggregates";
import { filterStatusCodesForStockUnitsDropdown } from "@/features/inventory/utils/stock-units-status-dropdown";
import type {
  InventoryListSort,
  InventoryListSortDir,
} from "@/features/inventory/repositories/inventory.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  hasPermission,
  requireAuth,
  requirePermission,
} from "@/lib/auth/permissions";
import type { PaginatedResult } from "@/lib/shared/pagination";

/** DTO row returned by listInventoryAction (ISO dates, sku alias). */
export type InventoryListItem = {
  id: string;
  onPlanogram: boolean;
  deliveryNo: string | null;
  deliveryDate: string | null;
  agingDays: number;
  pendingDefectInspection: boolean;
  pendingDefectReportId: string | null;
  /** When this unit's status last changed. Null until a status change is recorded. */
  statusUpdatedAt: string | null;
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

export type InventoryGroupCountsDto = InventoryGroupAggregates;

export type InventoryGroupBranchItemDto = {
  branch: { id: string; name: string; sapCode: string };
  counts: InventoryGroupCountsDto;
};

export type InventoryGroupModelItemDto = {
  model: {
    id: string;
    sku: string;
    name: string;
    brand: { name: string } | null;
  };
  counts: InventoryGroupCountsDto;
};

export type InventoryGroupBranchInModelItemDto = InventoryGroupBranchInModelSummary;

export type InventoryGroupWarehouseItemDto = InventoryGroupWarehouseSummary;

const STOCK_UNITS_GROUP_BY = new Set<StockUnitsGroupBy>([
  "by-branch",
  "by-warehouse",
  "by-model",
]);
const STOCK_UNITS_GROUP_CHILD_LEVELS = new Set<StockUnitsGroupChildLevel>([
  "models",
  "branches",
  "warehouses",
  "serials",
]);

function parseGroupBy(value?: string): StockUnitsGroupBy | undefined {
  if (value && STOCK_UNITS_GROUP_BY.has(value as StockUnitsGroupBy)) {
    return value as StockUnitsGroupBy;
  }
  return undefined;
}

function parseGroupChildLevel(
  value?: string,
): StockUnitsGroupChildLevel | undefined {
  if (
    value &&
    STOCK_UNITS_GROUP_CHILD_LEVELS.has(value as StockUnitsGroupChildLevel)
  ) {
    return value as StockUnitsGroupChildLevel;
  }
  return undefined;
}

function toGroupListOptions(input?: {
  branchId?: string;
  sku?: string;
  statusCodeId?: string;
  offPlanogram?: boolean;
  q?: string;
}): InventoryGroupListOptions {
  return {
    branchId: input?.branchId,
    skuCode: input?.sku,
    statusCodeId: input?.statusCodeId,
    offPlanogramOnly: input?.offPlanogram === true,
    q: input?.q,
  };
}

function mapEnrichedToListItem(
  r: Awaited<
    ReturnType<typeof inventoryService.listForUser>
  >["items"][number],
): InventoryListItem {
  return {
    id: r.id,
    onPlanogram: r.onPlanogram,
    deliveryNo: r.deliveryNo,
    deliveryDate: r.deliveryDate ? r.deliveryDate.toISOString() : null,
    agingDays: r.agingDays,
    pendingDefectInspection: r.pendingDefectInspection,
    pendingDefectReportId: r.pendingDefectReportId,
    statusUpdatedAt: r.statusUpdatedAt ? r.statusUpdatedAt.toISOString() : null,
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
  };
}

function isUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

const INVENTORY_SORT_FIELDS = new Set<InventoryListSort>([
  "updatedAt",
  "branch",
  "model",
  "serial",
  "dr",
  "drDate",
  "planogram",
  "aging",
  "status",
]);

function parseSort(value?: string): InventoryListSort | undefined {
  if (value && INVENTORY_SORT_FIELDS.has(value as InventoryListSort)) {
    return value as InventoryListSort;
  }
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
  /** Omit to keep All serials on STK, DU, and DEF. */
  statusCodes?: readonly string[];
  /** Serial number or model. */
  q?: string;
  sort?: string;
  sortDir?: string;
}): Promise<PaginatedResult<InventoryListItem>> {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  const limit = parseTablePageSize(input?.limit);
  const q = input?.q?.trim();
  const filters: InventoryListOptions = {
    branchId: input?.branchId,
    skuCode: input?.sku,
    statusCodeId: input?.statusCodeId,
    offPlanogramOnly: input?.offPlanogram === true,
    ...(input?.statusCodes !== undefined ? { statusCodes: input.statusCodes } : {}),
    ...(q ? { q } : {}),
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
    items: result.items.map((r) => mapEnrichedToListItem(r)),
  };
}

export async function listInventoryGroupsAction(input: {
  groupBy: string;
  page?: number;
  limit?: number;
  branchId?: string;
  sku?: string;
  statusCodeId?: string;
  offPlanogram?: boolean;
  q?: string;
  /** Return every group so the table can filter the full list while typing. */
  all?: boolean;
}): Promise<
  PaginatedResult<InventoryGroupBranchItemDto | InventoryGroupModelItemDto>
> {
  const session = await requirePermission("inventory.view");
  const groupBy = parseGroupBy(input.groupBy);
  if (!groupBy) {
    throw new Error("Invalid inventory group view");
  }
  const unrestricted = isUnrestricted(session.user.permissions);
  const limit = input.all ? 10_000 : parseTablePageSize(input.limit);
  return inventoryService.listGroupsForUser(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    groupBy,
    { page: input.page, limit },
    toGroupListOptions(input),
  ) as Promise<
    PaginatedResult<InventoryGroupBranchItemDto | InventoryGroupModelItemDto>
  >;
}

export async function listInventoryGroupChildrenAction(input: {
  groupBy: string;
  level: string;
  branchId?: string;
  modelId?: string;
  page?: number;
  limit?: number;
  branchIdFilter?: string;
  sku?: string;
  statusCodeId?: string;
  offPlanogram?: boolean;
  q?: string;
}): Promise<
  PaginatedResult<
    | InventoryGroupModelItemDto
    | InventoryGroupBranchInModelItemDto
    | InventoryGroupWarehouseItemDto
    | InventoryListItem
  >
> {
  const session = await requirePermission("inventory.view");
  const groupBy = parseGroupBy(input.groupBy);
  const level = parseGroupChildLevel(input.level);
  if (!groupBy || !level) {
    throw new Error("Invalid inventory group expansion");
  }
  const unrestricted = isUnrestricted(session.user.permissions);
  const limit = parseTablePageSize(input.limit);
  const result = await inventoryService.listGroupChildrenForUser(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    {
      groupBy,
      level,
      branchId: input.branchId,
      modelId: input.modelId,
      pagination: { page: input.page, limit },
      filters: toGroupListOptions({
        branchId: input.branchIdFilter,
        sku: input.sku,
        statusCodeId: input.statusCodeId,
        offPlanogram: input.offPlanogram,
        q: input.q,
      }),
    },
  );

  if (level === "serials") {
    return {
      ...result,
      items: (
        result.items as Awaited<
          ReturnType<typeof inventoryService.listForUser>
        >["items"]
      ).map((r) => mapEnrichedToListItem(r)),
    };
  }

  return result as PaginatedResult<
    | InventoryGroupModelItemDto
    | InventoryGroupBranchInModelItemDto
    | InventoryGroupWarehouseItemDto
  >;
}

export async function listInventoryStatusOptionsAction(input?: {
  /** Stock units dropdown hides DEF. Branch Inventory v2 lists every inventory status. */
  includeDefective?: boolean;
}): Promise<InventoryStatusOption[]> {
  const session = await requirePermission("inventory.view");
  const codes = (await reasonStatusService.listActiveCodes(
    session.user.tenantId,
    "inventory_system",
  )) as Array<{ id: string; code: string; name: string }>;
  const visible = input?.includeDefective
    ? codes
    : filterStatusCodesForStockUnitsDropdown(codes);
  return visible.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
  }));
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

/** Peso lines for the four Branch Inventory v2 home cards. Counts stay on the page. */
export async function getBranchInventoryV2CardAmountsAction() {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  return inventoryService.getBranchInventoryV2CardAmounts(
    session.user.tenantId,
    session.user.id,
    unrestricted,
  );
}

/** Peso lines for one branch's status cards. Counts stay on the page. */
export async function getBranchInventoryV2StatusAmountsAction(branchId: string) {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  return inventoryService.getBranchInventoryV2StatusAmounts(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    branchId,
  );
}

/** Sidebar badge: live STK qty in the caller's Stock units scope (0 when unauthorized). */
export async function countStockUnitsStkAction(): Promise<number> {
  const session = await requireAuth();
  if (!hasPermission(session.user.permissions, "inventory.view")) {
    return 0;
  }
  const unrestricted = isUnrestricted(session.user.permissions);
  return inventoryService.countStkForUser(
    session.user.tenantId,
    session.user.id,
    unrestricted,
  );
}

export type BranchInventoryUnreadSummary = {
  total: number;
  byCode: Record<string, number>;
  /** Unread units keyed by branch id, then status code. */
  byBranchCode: Record<string, Record<string, number>>;
};

/** Sidebar badge: units whose status changed after this user last opened them. */
export async function countBranchInventoryV2UpdatesAction(): Promise<number> {
  const session = await requireAuth();
  if (!hasPermission(session.user.permissions, "inventory.view")) {
    return 0;
  }
  const summary = await unreadSummaryForSession(session.user, undefined);
  return summary.total;
}

/** Unread counts for Branch Inventory v2. Pass a branch to limit the stat strip. */
export async function getBranchInventoryUnreadAction(input?: {
  branchId?: string;
}): Promise<BranchInventoryUnreadSummary> {
  const session = await requirePermission("inventory.view");
  return unreadSummaryForSession(session.user, input?.branchId);
}

/** Which of these units are still unread for the signed-in user. */
export async function listUnreadBranchInventoryIdsAction(
  branchInventoryIds: string[],
): Promise<string[]> {
  const session = await requirePermission("inventory.view");
  const ids = [...new Set(branchInventoryIds.filter((id) => id.trim().length > 0))];
  return inventoryService.unreadInventoryIds(
    session.user.tenantId,
    session.user.id,
    isUnrestricted(session.user.permissions),
    ids,
  );
}

/** Opening unit details marks that status change as seen. */
export async function markBranchInventoryStatusReadAction(
  branchInventoryId: string,
): Promise<{ success: true } | { error: string }> {
  const session = await requirePermission("inventory.view");
  try {
    await inventoryService.markStatusSeen({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      permissions: session.user.permissions,
      inventoryId: branchInventoryId,
    });
    revalidatePath("/inventory/v2");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update what you have seen" };
  }
}

function unreadSummaryForSession(
  user: { tenantId: string; id: string; permissions: string[] },
  branchId: string | undefined,
): Promise<BranchInventoryUnreadSummary> {
  return inventoryService.unreadStatusSummary(
    user.tenantId,
    user.id,
    isUnrestricted(user.permissions),
    branchId,
  );
}

export async function updateInventoryStatusAction(
  inventoryId: string,
  targetCode: "STK" | "DU",
) {
  const session = await requirePermission("inventory.view");
  switch (targetCode) {
    case "STK":
    case "DU":
      break;
    default: {
      const unexpected: never = targetCode;
      return { error: `This status cannot be set from here (${unexpected})` };
    }
  }

  try {
    const statusCodeId = await reasonStatusService.requireCodeId(
      session.user.tenantId,
      "inventory_system",
      targetCode,
    );
    await inventoryService.updateStatus({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      permissions: session.user.permissions,
      inventoryId,
      statusCodeId,
    });
    revalidatePath("/inventory");
    revalidatePath("/inventory/v2");
    revalidatePath("/inventory/serial-numbers");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update status" };
  }
}
