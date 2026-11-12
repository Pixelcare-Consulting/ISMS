import { auditService } from "@/features/audit/services/audit.service";
import { aorService } from "@/features/aors/services/aor.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { defectRepository } from "@/features/inventory/repositories/defect.repository";
import { inventoryStatusSeenService } from "@/features/inventory/services/inventory-status-seen.service";
import type {
  StockUnitsGroupBy,
  StockUnitsGroupChildLevel,
  StockUnitsWarehouseRole,
} from "@/features/inventory/constants/stock-units-group";
import {
  inventoryRepository,
  type InventoryGroupBranchRow,
  type InventoryGroupListFilters,
  type InventoryGroupModelRow,
  type InventoryGroupStatusCodeRef,
  type InventoryGroupWarehouseRow,
  type InventoryListFilters,
  type InventoryListRow,
  type InventoryListSort,
  type InventoryListSortDir,
} from "@/features/inventory/repositories/inventory.repository";
import { isBranchInventoryV2HiddenStatus } from "@/features/inventory/utils/branch-inventory-v2";
import {
  sumBranchInventoryV2CardAmounts,
  sumBranchInventoryV2StatusAmounts,
  type BranchInventoryV2CardAmounts,
  type BranchInventoryV2StatusAmounts,
} from "@/features/inventory/utils/branch-inventory-v2-card-amounts";
import { groupStockByModelSeries } from "@/features/inventory/utils/group-stock-by-model-series";
import {
  inventoryGroupStatusesFromCounts,
  type InventoryGroupAggregates,
  type InventoryGroupCountParts,
} from "@/features/inventory/utils/stock-units-group-aggregates";
import { wholeDaysBetween } from "@/features/inventory/utils/sku-series";
import { formatPeriodDate } from "@/features/master-data/types/client-price-list";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { hasPermission } from "@/lib/auth/permissions";
import { decimalToNumber, decimalToNumberOrNull } from "@/lib/database/decimal";
import { logger } from "@/lib/shared/logger";
import {
  resolvePagination,
  type PaginatedResult,
} from "@/lib/shared/pagination";

export interface InventoryStatusKpi {
  code: string;
  name: string;
  /** Palette key from ReasonStatusCode.color (masterdata). */
  color: string | null;
  count: number;
}

export interface InventoryKpis {
  totalUnits: number;
  statuses: InventoryStatusKpi[];
}

export type { BranchInventoryV2CardAmounts, BranchInventoryV2StatusAmounts };

export interface InventorySeriesRow {
  series: string;
  qty: number;
  value: number;
}

export interface InventorySeriesSummary {
  rows: InventorySeriesRow[];
  totalQty: number;
  totalValue: number;
}

export type InventoryListOptions = {
  branchId?: string;
  skuCode?: string;
  statusCodeId?: string;
  offPlanogramOnly?: boolean;
  statusCodes?: readonly string[];
  q?: string;
  sort?: InventoryListSort;
  sortDir?: InventoryListSortDir;
};

export type InventoryGroupListOptions = {
  branchId?: string;
  skuCode?: string;
  statusCodeId?: string;
  offPlanogramOnly?: boolean;
  q?: string;
};

export type InventoryGroupBranchSummary = {
  branch: { id: string; name: string; sapCode: string };
  counts: InventoryGroupAggregates;
};

export type InventoryGroupModelSummary = {
  model: {
    id: string;
    sku: string;
    name: string;
    brand: { name: string } | null;
  };
  counts: InventoryGroupAggregates;
};

export type InventoryGroupBranchInModelSummary = {
  branch: { id: string; name: string; sapCode: string };
  counts: InventoryGroupAggregates;
};

export type InventoryGroupWarehouseSummary = {
  /** Stable per branch: `${role}:${stockBranch.id}`. */
  key: string;
  role: StockUnitsWarehouseRole;
  /** Whose branch stock this warehouse holds; models and serials below are this branch's. */
  stockBranch: { id: string; name: string; sapCode: string };
  warehouse: { code: string; name: string } | null;
  counts: InventoryGroupAggregates;
};

export type InventoryListEnrichedItem = InventoryListRow & {
  onPlanogram: boolean;
  deliveryNo: string | null;
  deliveryDate: Date | null;
  agingDays: number;
  pendingDefectInspection: boolean;
  pendingDefectReportId: string | null;
};

type InventoryStatusCodeRow = {
  id: string;
  code: string;
  name: string;
  color: string | null;
};

const IMMEDIATE_STATUS_MESSAGE =
  "This unit can only move between Stock and Display unit";

async function assertBranchInAor(
  tenantId: string,
  userId: string,
  branchId: string,
  permissions: string[] | undefined,
) {
  const unrestricted =
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage");
  if (unrestricted) return;

  const branchIds = await aorService.getBranchIdsForUser(tenantId, userId);
  if (!branchIds.includes(branchId)) {
    throw new Error("Branch not in your area of responsibility");
  }
}

function assertImmediateStatusChange(currentCode: string, targetCode: string) {
  switch (currentCode) {
    case "STK":
      if (targetCode === "DU") return;
      break;
    case "DU":
      if (targetCode === "STK") return;
      break;
    default:
      break;
  }
  throw new Error(IMMEDIATE_STATUS_MESSAGE);
}

async function resolveBranchIds(
  tenantId: string,
  userId: string,
  isUnrestricted: boolean,
): Promise<string[]> {
  if (isUnrestricted) {
    const branches = await branchRepository.listByTenant(tenantId);
    return branches.map((b) => b.id);
  }
  return aorService.getBranchIdsForUser(tenantId, userId);
}

/** Same branch list as the inventory screens, optionally one branch inside that list. */
async function scopedBranchIds(
  tenantId: string,
  userId: string,
  isUnrestricted: boolean,
  branchId?: string,
): Promise<string[]> {
  const branchIds = await resolveBranchIds(tenantId, userId, isUnrestricted);
  if (!branchId) return branchIds;
  return branchIds.filter((id) => id === branchId);
}

function toListFilters(filters?: InventoryListOptions): InventoryListFilters {
  return {
    branchId: filters?.branchId,
    skuCode: filters?.skuCode,
    statusCodeId: filters?.statusCodeId,
    offPlanogramOnly: filters?.offPlanogramOnly,
    statusCodes: filters?.statusCodes,
    q: filters?.q,
  };
}

function toGroupListFilters(
  filters?: InventoryGroupListOptions,
): InventoryGroupListFilters {
  return {
    branchId: filters?.branchId,
    skuCode: filters?.skuCode,
    statusCodeId: filters?.statusCodeId,
    offPlanogramOnly: filters?.offPlanogramOnly,
    q: filters?.q,
  };
}

function toGroupAggregates(
  counts: InventoryGroupCountParts,
  codes: InventoryStatusCodeRow[],
): InventoryGroupAggregates {
  return {
    ...counts,
    statuses: inventoryGroupStatusesFromCounts(codes, counts.statusCounts),
  };
}

function branchRowToSummary(
  row: InventoryGroupBranchRow,
  codes: InventoryStatusCodeRow[],
): InventoryGroupBranchSummary {
  const { branchId, branchName, branchSapCode, ...counts } = row;
  return {
    branch: { id: branchId, name: branchName, sapCode: branchSapCode },
    counts: toGroupAggregates(counts, codes),
  };
}

function modelRowToSummary(
  row: InventoryGroupModelRow,
  codes: InventoryStatusCodeRow[],
): InventoryGroupModelSummary {
  const { modelId, skuCode, modelName, brandName, ...counts } = row;
  return {
    model: {
      id: modelId,
      sku: skuCode,
      name: modelName,
      brand: brandName ? { name: brandName } : null,
    },
    counts: toGroupAggregates(counts, codes),
  };
}

function warehouseRowToSummary(
  row: InventoryGroupWarehouseRow,
  codes: InventoryStatusCodeRow[],
): InventoryGroupWarehouseSummary {
  const {
    role,
    stockBranchId,
    stockBranchName,
    stockBranchSapCode,
    warehouseCode,
    warehouseName,
    ...counts
  } = row;
  return {
    key: `${role}:${stockBranchId}`,
    role,
    stockBranch: { id: stockBranchId, name: stockBranchName, sapCode: stockBranchSapCode },
    warehouse:
      warehouseCode !== null ? { code: warehouseCode, name: warehouseName ?? warehouseCode } : null,
    counts: toGroupAggregates(counts, codes),
  };
}

function toStatusCodeRefs(codes: InventoryStatusCodeRow[]): InventoryGroupStatusCodeRef[] {
  return codes.map((code) => ({ id: code.id, code: code.code }));
}

async function loadInventoryStatusCodes(
  tenantId: string,
): Promise<InventoryStatusCodeRow[]> {
  return (await reasonStatusRepository.listActiveCodesByCategory(
    tenantId,
    "inventory_system",
  )) as InventoryStatusCodeRow[];
}

export const inventoryService = {
  async listGroupsForUser(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    groupBy: StockUnitsGroupBy,
    pagination?: { page?: number; limit?: number },
    filters?: InventoryGroupListOptions,
  ): Promise<
    PaginatedResult<InventoryGroupBranchSummary | InventoryGroupModelSummary>
  > {
    const [branchIds, statusCodes] = await Promise.all([
      resolveBranchIds(tenantId, userId, isUnrestricted),
      loadInventoryStatusCodes(tenantId),
    ]);
    const groupFilters = toGroupListFilters(filters);
    const statusCodeRefs = toStatusCodeRefs(statusCodes);
    // By warehouse lists the same branches as By branch; the warehouses sit below them.
    const byBranch = groupBy === "by-branch" || groupBy === "by-warehouse";
    const result =
      byBranch
        ? await inventoryRepository.listBranchGroups(
            tenantId,
            branchIds,
            pagination,
            groupFilters,
            statusCodeRefs,
          )
        : await inventoryRepository.listModelGroups(
            tenantId,
            branchIds,
            pagination,
            groupFilters,
            statusCodeRefs,
          );

    return {
      ...result,
      items:
        byBranch
          ? (result.items as InventoryGroupBranchRow[]).map((row) =>
              branchRowToSummary(row, statusCodes),
            )
          : (result.items as InventoryGroupModelRow[]).map((row) =>
              modelRowToSummary(row, statusCodes),
            ),
    };
  },

  async listGroupChildrenForUser(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    input: {
      groupBy: StockUnitsGroupBy;
      level: StockUnitsGroupChildLevel;
      branchId?: string;
      modelId?: string;
      pagination?: { page?: number; limit?: number };
      filters?: InventoryGroupListOptions;
    },
  ): Promise<
    PaginatedResult<
      | InventoryGroupModelSummary
      | InventoryGroupBranchInModelSummary
      | InventoryGroupWarehouseSummary
      | InventoryListEnrichedItem
    >
  > {
    const [branchIds, statusCodes] = await Promise.all([
      resolveBranchIds(tenantId, userId, isUnrestricted),
      loadInventoryStatusCodes(tenantId),
    ]);
    const groupFilters = toGroupListFilters(input.filters);
    const statusCodeRefs = toStatusCodeRefs(statusCodes);

    if (input.level === "serials") {
      if (!input.branchId || !input.modelId) {
        const { limit, page } = resolvePagination(input.pagination);
        return {
          items: [],
          total: 0,
          page,
          limit,
          totalPages: 1,
        };
      }
      const result = await inventoryRepository.listGroupSerials(
        tenantId,
        branchIds,
        input.pagination,
        {
          ...groupFilters,
          branchId: input.branchId,
          modelId: input.modelId,
        },
        statusCodeRefs,
      );
      const withPlanogram = await this.enrichWithPlanogramFlags(tenantId, result);
      const withAging = await this.enrichWithDeliveryAging(tenantId, withPlanogram);
      return this.enrichWithPendingDefectFlags(tenantId, withAging);
    }

    if (input.groupBy === "by-warehouse" && input.level === "warehouses") {
      const { limit, page } = resolvePagination(input.pagination);
      if (!input.branchId) {
        return { items: [], total: 0, page, limit, totalPages: 1 };
      }
      const rows = await inventoryRepository.listWarehousesInBranchGroup(
        tenantId,
        branchIds,
        input.branchId,
        groupFilters,
        statusCodeRefs,
      );
      return {
        items: rows.map((row) => warehouseRowToSummary(row, statusCodes)),
        total: rows.length,
        page: 1,
        limit: Math.max(limit, rows.length),
        totalPages: 1,
      };
    }

    // Under a warehouse, `branchId` is that warehouse's stock branch (see listWarehousesInBranchGroup).
    if (
      (input.groupBy === "by-branch" || input.groupBy === "by-warehouse") &&
      input.level === "models"
    ) {
      if (!input.branchId) {
        const { limit, page } = resolvePagination(input.pagination);
        return { items: [], total: 0, page, limit, totalPages: 1 };
      }
      const result = await inventoryRepository.listModelsInBranchGroup(
        tenantId,
        branchIds,
        input.branchId,
        input.pagination,
        groupFilters,
        statusCodeRefs,
      );
      return {
        ...result,
        items: result.items.map((row) => modelRowToSummary(row, statusCodes)),
      };
    }

    if (input.groupBy === "by-model" && input.level === "branches") {
      if (!input.modelId) {
        const { limit, page } = resolvePagination(input.pagination);
        return { items: [], total: 0, page, limit, totalPages: 1 };
      }
      const result = await inventoryRepository.listBranchesInModelGroup(
        tenantId,
        branchIds,
        input.modelId,
        input.pagination,
        groupFilters,
        statusCodeRefs,
      );
      return {
        ...result,
        items: result.items.map((row) => branchRowToSummary(row, statusCodes)),
      };
    }

    const { limit, page } = resolvePagination(input.pagination);
    return { items: [], total: 0, page, limit, totalPages: 1 };
  },

  async listForUser(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    pagination?: { page?: number; limit?: number },
    filters?: InventoryListOptions,
  ): Promise<PaginatedResult<InventoryListEnrichedItem>> {
    const branchIds = await resolveBranchIds(tenantId, userId, isUnrestricted);
    const result = await inventoryRepository.listByBranches(
      tenantId,
      branchIds,
      pagination,
      toListFilters(filters),
      { field: filters?.sort, dir: filters?.sortDir },
    );
    const withPlanogram = await this.enrichWithPlanogramFlags(tenantId, result);
    const withAging = await this.enrichWithDeliveryAging(tenantId, withPlanogram);
    return this.enrichWithPendingDefectFlags(tenantId, withAging);
  },

  async enrichWithPlanogramFlags<
    TItem extends { branchId: string; serialNumber: { model: { id: string } } },
  >(
    tenantId: string,
    result: PaginatedResult<TItem>,
  ): Promise<PaginatedResult<TItem & { onPlanogram: boolean }>> {
    const { planogramRepository } = await import(
      "@/features/planogram/repositories/planogram.repository"
    );

    // Batch: one query for all (branch, model) pairs on the page instead of N.
    const pairs = result.items.map((item) => ({
      branchId: item.branchId,
      modelId: item.serialNumber.model.id,
    }));
    const onPlanogramKeys = await planogramRepository.findOnPlanogramPairs(tenantId, pairs);

    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        onPlanogram: onPlanogramKeys.has(
          `${item.branchId}:${item.serialNumber.model.id}`,
        ),
      })),
    };
  },

  async enrichWithDeliveryAging<
    TItem extends { serialNumberId: string; createdAt: Date },
  >(
    tenantId: string,
    result: PaginatedResult<TItem>,
  ): Promise<
    PaginatedResult<
      TItem & {
        deliveryNo: string | null;
        deliveryDate: Date | null;
        agingDays: number;
      }
    >
  > {
    const deliveries = await inventoryRepository.findLatestDeliveryReceipts(
      tenantId,
      result.items.map((item) => item.serialNumberId),
    );
    const bySerial = new Map(
      deliveries.map((d) => [d.serialNumberId, d] as const),
    );

    return {
      ...result,
      items: result.items.map((item) => {
        const delivery = bySerial.get(item.serialNumberId);
        const agingAnchor = delivery?.deliveryDate ?? item.createdAt;
        return {
          ...item,
          deliveryNo: delivery?.deliveryNo ?? null,
          deliveryDate: delivery?.deliveryDate ?? null,
          agingDays: wholeDaysBetween(agingAnchor),
        };
      }),
    };
  },

  async enrichWithPendingDefectFlags<TItem extends { id: string }>(
    tenantId: string,
    result: PaginatedResult<TItem>,
  ): Promise<
    PaginatedResult<
      TItem & { pendingDefectInspection: boolean; pendingDefectReportId: string | null }
    >
  > {
    const pendingIds = await defectRepository.findOpenPendingBranchInventoryIds(
      tenantId,
      result.items.map((item) => item.id),
    );
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        pendingDefectInspection: pendingIds.has(item.id),
        pendingDefectReportId: pendingIds.get(item.id) ?? null,
      })),
    };
  },

  async getSeriesSummary(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    filters?: InventoryListOptions,
  ): Promise<InventorySeriesSummary> {
    const branchIds = await resolveBranchIds(tenantId, userId, isUnrestricted);
    if (branchIds.length === 0) {
      return { rows: [], totalQty: 0, totalValue: 0 };
    }

    // One row per SKU price, with the series stored on that model.
    const skuRows = await inventoryRepository.aggregateSeriesBySku(
      tenantId,
      branchIds,
      toListFilters(filters),
    );

    return groupStockByModelSeries(
      skuRows.map((row) => ({
        seriesName: row.seriesName,
        srp: decimalToNumber(row.srp),
        qty: row.qty,
      })),
    );
  },

  /** AOR-scoped STK count matching Stock units list scoping. */
  async countStkForUser(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
  ): Promise<number> {
    const branchIds = await resolveBranchIds(tenantId, userId, isUnrestricted);
    return inventoryRepository.countStockUnits(tenantId, branchIds);
  },

  async getKpis(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
  ): Promise<InventoryKpis> {
    const branchIds = await resolveBranchIds(tenantId, userId, isUnrestricted);

    const codes = (await reasonStatusRepository.listActiveCodesByCategory(
      tenantId,
      "inventory_system",
    )) as InventoryStatusCodeRow[];

    if (branchIds.length === 0) {
      return {
        totalUnits: 0,
        statuses: codes.map((c) => ({
          code: c.code,
          name: c.name,
          color: c.color,
          count: 0,
        })),
      };
    }

    const [statusGroups, totalUnits] = await Promise.all([
      inventoryRepository.countByStatus(tenantId, branchIds),
      inventoryRepository.countAll(tenantId, branchIds),
    ]);

    const countByCodeId = new Map(
      (
        statusGroups as Array<{ statusCodeId: string; _count: { id: number } }>
      ).map((g) => [g.statusCodeId, g._count.id]),
    );

    return {
      totalUnits,
      statuses: codes.map((c) => ({
        code: c.code,
        name: c.name,
        color: c.color,
        count: countByCodeId.get(c.id) ?? 0,
      })),
    };
  },

  /**
   * Peso totals for the four Branch Inventory v2 home cards.
   * Sold and Official Sold are left out. Each amount is quantity times the
   * display price list (or the model SRP when the model has no price list).
   */
  async getBranchInventoryV2CardAmounts(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
  ): Promise<BranchInventoryV2CardAmounts> {
    const empty: BranchInventoryV2CardAmounts = {
      total: 0,
      inStock: 0,
      defective: 0,
      offPlanogram: 0,
    };
    const [branchIds, statusCodes] = await Promise.all([
      resolveBranchIds(tenantId, userId, isUnrestricted),
      loadInventoryStatusCodes(tenantId),
    ]);
    const visibleStatusIds = statusCodes
      .filter((status) => !isBranchInventoryV2HiddenStatus(status.code))
      .map((status) => status.id);
    if (branchIds.length === 0 || visibleStatusIds.length === 0) return empty;

    const qtyRows = await inventoryRepository.aggregateBranchInventoryV2ModelQty(
      tenantId,
      branchIds,
      visibleStatusIds,
    );
    if (qtyRows.length === 0) return empty;

    const priceLists = await inventoryRepository.listModelPriceListRows(
      tenantId,
      qtyRows.map((row) => row.modelId),
    );

    return sumBranchInventoryV2CardAmounts(
      qtyRows.map((row) => ({
        modelId: row.modelId,
        srp: decimalToNumberOrNull(row.srp),
        totalQty: row.totalQty,
        inStockQty: row.inStockQty,
        defectiveQty: row.defectiveQty,
        offPlanogramQty: row.offPlanogramQty,
      })),
      priceLists.map((row) => ({
        modelId: row.modelId,
        amount: decimalToNumber(row.amount),
        periodStart: formatPeriodDate(row.periodStart),
        periodEnd: formatPeriodDate(row.periodEnd),
        packageTypeId: row.packageTypeId,
      })),
    );
  },

  /**
   * Peso totals for one branch's status cards.
   * Sold and Official Sold are left out. Each amount is that card's quantity
   * times the same display price the home cards use.
   */
  async getBranchInventoryV2StatusAmounts(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    branchId: string,
  ): Promise<BranchInventoryV2StatusAmounts> {
    const empty: BranchInventoryV2StatusAmounts = {
      total: 0,
      offPlanogram: 0,
      byStatus: {},
    };
    const trimmedBranchId = branchId.trim();
    if (!trimmedBranchId) return empty;

    const [branchIds, statusCodes] = await Promise.all([
      scopedBranchIds(tenantId, userId, isUnrestricted, trimmedBranchId),
      loadInventoryStatusCodes(tenantId),
    ]);
    const visibleStatuses = statusCodes.filter(
      (status) => !isBranchInventoryV2HiddenStatus(status.code),
    );
    const branchInScope = branchIds[0];
    if (!branchInScope || visibleStatuses.length === 0) return empty;

    const qtyRows = await inventoryRepository.aggregateBranchInventoryV2StatusQty(
      tenantId,
      branchInScope,
      toStatusCodeRefs(visibleStatuses),
    );
    if (qtyRows.length === 0) return empty;

    const priceLists = await inventoryRepository.listModelPriceListRows(
      tenantId,
      qtyRows.map((row) => row.modelId),
    );

    return sumBranchInventoryV2StatusAmounts(
      qtyRows.map((row) => ({
        modelId: row.modelId,
        srp: decimalToNumberOrNull(row.srp),
        totalQty: row.totalQty,
        offPlanogramQty: row.offPlanogramQty,
        qtyByStatus: row.qtyByStatus,
      })),
      priceLists.map((row) => ({
        modelId: row.modelId,
        amount: decimalToNumber(row.amount),
        periodStart: formatPeriodDate(row.periodStart),
        periodEnd: formatPeriodDate(row.periodEnd),
        packageTypeId: row.packageTypeId,
      })),
    );
  },

  async updateStatus(input: {
    tenantId: string;
    actorUserId: string;
    permissions: string[] | undefined;
    inventoryId: string;
    statusCodeId: string;
  }) {
    const codes = (await reasonStatusRepository.listActiveCodesByCategory(
      input.tenantId,
      "inventory_system",
    )) as InventoryStatusCodeRow[];
    const target = codes.find((c) => c.id === input.statusCodeId);
    if (!target) {
      throw new Error("Invalid inventory status code");
    }

    const current = await inventoryRepository.findByIdWithStatus(
      input.tenantId,
      input.inventoryId,
    );
    if (!current) {
      throw new Error("Inventory unit not found");
    }

    await assertBranchInAor(
      input.tenantId,
      input.actorUserId,
      current.branchId,
      input.permissions,
    );
    assertImmediateStatusChange(current.statusCode.code, target.code);

    const pending = await defectRepository.findOpenPendingByBranchInventoryId(
      input.tenantId,
      current.id,
    );
    if (pending) {
      throw new Error("This unit is waiting for the team leader");
    }

    const fromName = current.statusCode.name;
    const toName = target.name;
    const item = await inventoryRepository.updateStatus({
      tenantId: input.tenantId,
      id: input.inventoryId,
      statusCodeId: input.statusCodeId,
      updatedById: input.actorUserId,
      serialNumberId: current.serialNumberId,
      historyDetails: `Status changed from ${fromName} (${current.statusCode.code}) to ${toName} (${target.code})`,
      historyStatus: target.code,
    });
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "inventory.status_updated",
      entityType: "BranchInventory",
      entityId: item.id,
      metadata: {
        fromStatusCode: current.statusCode.code,
        statusCode: target.code,
        statusName: target.name,
      },
    });
    return item;
  },

  /** Unread status changes in the same branch scope as the inventory list. */
  async unreadStatusSummary(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    branchId?: string,
  ): Promise<{
    total: number;
    byCode: Record<string, number>;
    byBranchCode: Record<string, Record<string, number>>;
  }> {
    try {
      const branchIds = await scopedBranchIds(tenantId, userId, isUnrestricted, branchId);
      const counts = await inventoryStatusSeenService.unreadCounts({
        tenantId,
        userId,
        branchIds,
      });
      return {
        total: counts.total,
        byCode: counts.byCode,
        byBranchCode: counts.byBranchCode,
      };
    } catch (error) {
      logger.warn({ err: error }, "branch inventory unread summary failed");
      return { total: 0, byCode: {}, byBranchCode: {} };
    }
  },

  async unreadInventoryIds(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    branchInventoryIds: string[],
  ): Promise<string[]> {
    if (branchInventoryIds.length === 0) return [];
    try {
      const branchIds = await resolveBranchIds(tenantId, userId, isUnrestricted);
      const cursor = await inventoryStatusSeenService.ensureSeenThrough(userId);
      return await inventoryStatusSeenService.unreadIds({
        tenantId,
        userId,
        seenThroughAt: cursor.seenThroughAt,
        branchIds,
        branchInventoryIds,
      });
    } catch (error) {
      logger.warn({ err: error }, "branch inventory unread ids failed");
      return [];
    }
  },

  async markStatusSeen(input: {
    tenantId: string;
    userId: string;
    permissions: string[] | undefined;
    inventoryId: string;
  }) {
    const current = await inventoryRepository.findByIdWithStatus(
      input.tenantId,
      input.inventoryId,
    );
    if (!current) {
      throw new Error("Inventory unit not found");
    }
    await assertBranchInAor(
      input.tenantId,
      input.userId,
      current.branchId,
      input.permissions,
    );
    await inventoryStatusSeenService.markRead(input.userId, input.inventoryId);
  },
};
