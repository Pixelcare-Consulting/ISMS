import { auditService } from "@/features/audit/services/audit.service";
import { aorService } from "@/features/aors/services/aor.service";
import {
  inventoryRepository,
  type InventoryListFilters,
  type InventoryListSort,
  type InventoryListSortDir,
} from "@/features/inventory/repositories/inventory.repository";
import {
  deriveSkuSeries,
  wholeDaysBetween,
} from "@/features/inventory/utils/sku-series";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { decimalToNumber } from "@/lib/database/decimal";

export interface InventoryStatusKpi {
  code: string;
  name: string;
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

async function resolveBranchIds(
  tenantId: string,
  userId: string,
  isUnrestricted: boolean,
): Promise<string[]> {
  if (isUnrestricted) {
    const { branchRepository } = await import(
      "@/features/branches/repositories/branch.repository"
    );
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

export const inventoryService = {
  async listForUser(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    pagination?: { page?: number; limit?: number },
    filters?: InventoryListOptions,
  ) {
    const branchIds = await resolveBranchIds(tenantId, userId, isUnrestricted);

    if (!isUnrestricted && branchIds.length === 0) {
      return inventoryRepository.listByBranches(
        tenantId,
        [],
        pagination,
        toListFilters(filters),
      );
    }

    const result = await inventoryRepository.listByBranches(
      tenantId,
      branchIds,
      pagination,
      toListFilters(filters),
      { field: filters?.sort, dir: filters?.sortDir },
    );
    const withPlanogram = await this.enrichWithPlanogramFlags(tenantId, result);
    return this.enrichWithDeliveryAging(tenantId, withPlanogram);
  },

  async enrichWithPlanogramFlags<
    T extends {
      items: { branchId: string; serialNumber: { model: { id: string } } }[];
    },
  >(tenantId: string, result: T) {
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
    T extends {
      items: {
        serialNumberId: string;
        createdAt: Date;
      }[];
    },
  >(tenantId: string, result: T) {
    const deliveries = await inventoryRepository.findLatestAcceptedDeliveries(
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

    const rows = await inventoryRepository.listSeriesRows(
      tenantId,
      branchIds,
      toListFilters(filters),
    );

    const bySeries = new Map<string, { qty: number; value: number }>();
    for (const row of rows) {
      const skuCode = row.serialNumber.model.skuCode;
      const series = deriveSkuSeries(skuCode);
      const srp = decimalToNumber(row.serialNumber.model.srp) ?? 0;
      const current = bySeries.get(series) ?? { qty: 0, value: 0 };
      current.qty += 1;
      current.value += srp;
      bySeries.set(series, current);
    }

    const summaryRows = Array.from(bySeries.entries())
      .map(([series, agg]) => ({
        series,
        qty: agg.qty,
        value: agg.value,
      }))
      .sort((a, b) => a.series.localeCompare(b.series));

    return {
      rows: summaryRows,
      totalQty: summaryRows.reduce((sum, r) => sum + r.qty, 0),
      totalValue: summaryRows.reduce((sum, r) => sum + r.value, 0),
    };
  },

  async getKpis(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
  ): Promise<InventoryKpis> {
    const branchIds = await resolveBranchIds(tenantId, userId, isUnrestricted);

    const codes = await reasonStatusRepository.listActiveCodesByCategory(
      tenantId,
      "inventory_system",
    );

    if (branchIds.length === 0) {
      return {
        totalUnits: 0,
        statuses: codes.map((c) => ({ code: c.code, name: c.name, count: 0 })),
      };
    }

    const [statusGroups, totalUnits] = await Promise.all([
      inventoryRepository.countByStatus(tenantId, branchIds),
      inventoryRepository.countAll(tenantId, branchIds),
    ]);

    const countByCodeId = new Map(
      statusGroups.map((g) => [g.statusCodeId, g._count.id]),
    );

    return {
      totalUnits,
      statuses: codes.map((c) => ({
        code: c.code,
        name: c.name,
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
    const codes = await reasonStatusRepository.listActiveCodesByCategory(
      input.tenantId,
      "inventory_system",
    );
    const target = codes.find((c) => c.id === input.statusCodeId);
    if (!target) {
      throw new Error("Invalid inventory status code");
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
