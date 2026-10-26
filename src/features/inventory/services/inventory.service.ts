import { auditService } from "@/features/audit/services/audit.service";
import { aorService } from "@/features/aors/services/aor.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
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
import { groupStockByModelSeries } from "@/features/inventory/utils/group-stock-by-model-series";
import {
  inventoryGroupStatusesFromCounts,
  type InventoryGroupAggregates,
  type InventoryGroupCountParts,
} from "@/features/inventory/utils/stock-units-group-aggregates";
import { wholeDaysBetween } from "@/features/inventory/utils/sku-series";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { decimalToNumber } from "@/lib/database/decimal";
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
};

type InventoryStatusCodeRow = {
  id: string;
  code: string;
  name: string;
  color: string | null;
};

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

function toListFilters(filters?: InventoryListOptions): InventoryListFilters {
  return {
    branchId: filters?.branchId,
    skuCode: filters?.skuCode,
    statusCodeId: filters?.statusCodeId,
    offPlanogramOnly: filters?.offPlanogramOnly,
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
  ): Promise<PaginatedResult<TItem & { pendingDefectInspection: boolean }>> {
    const { defectRepository } = await import(
      "@/features/inventory/repositories/defect.repository"
    );
    const pendingIds = await defectRepository.findOpenPendingBranchInventoryIds(
      tenantId,
      result.items.map((item) => item.id),
    );
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        pendingDefectInspection: pendingIds.has(item.id),
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

  async updateStatus(input: {
    tenantId: string;
    actorUserId: string;
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

    const currentCode = current.statusCode.code;
    const targetCode = target.code;
    if (
      (currentCode === "STK" && targetCode === "DEF") ||
      (currentCode === "DEF" && targetCode === "STK")
    ) {
      throw new Error(
        "Use the defect inspection workflow to change between STK and DEF",
      );
    }

    const item = await inventoryRepository.updateStatus(
      input.tenantId,
      input.inventoryId,
      input.statusCodeId,
      input.actorUserId,
    );
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "inventory.status_updated",
      entityType: "BranchInventory",
      entityId: item.id,
      metadata: { statusCode: target.code, statusName: target.name },
    });
    return item;
  },
};
