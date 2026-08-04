import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginatedResult,
} from "@/lib/shared/pagination";

const inventoryListInclude = {
  branch: { select: { id: true, name: true, sapCode: true } },
  statusCode: { select: { id: true, code: true, name: true, color: true } },
  serialNumber: {
    include: {
      model: {
        select: {
          id: true,
          skuCode: true,
          name: true,
          srp: true,
          brand: { select: { name: true } },
        },
      },
    },
  },
} as const;

/** Explicit list row (include shape) so PaginatedResult stays typed end-to-end. */
export type InventoryListRow = {
  id: string;
  tenantId: string;
  branchId: string;
  serialNumberId: string;
  statusCodeId: string;
  createdAt: Date;
  updatedAt: Date;
  branch: { id: string; name: string; sapCode: string };
  statusCode: { id: string; code: string; name: string; color: string | null };
  serialNumber: {
    id: string;
    serialNo: string;
    model: {
      id: string;
      skuCode: string;
      name: string;
      srp: unknown;
      brand: { name: string } | null;
    };
  };
};

export type InventoryListSort = "updatedAt" | "aging" | "dr";
export type InventoryListSortDir = "asc" | "desc";

export type InventoryListFilters = {
  branchId?: string;
  skuCode?: string;
  statusCodeId?: string;
  offPlanogramOnly?: boolean;
};

export type InventorySeriesSkuAgg = {
  skuCode: string;
  srp: { toString(): string } | number | null;
  qty: number;
};

type SeriesSkuAggRaw = {
  sku_code: string;
  srp: { toString(): string } | number | null;
  qty: number | bigint;
};

/**
 * Off-planogram = model not on THIS branch's planogram.
 * Prefetch planogram modelIds once, then filter with modelId NOT IN
 * (avoids N correlated `branchPlanograms: { none }` anti-joins).
 */
async function buildOffPlanogramBranchOr(
  tenantId: string,
  effectiveBranchIds: string[],
): Promise<Prisma.BranchInventoryWhereInput[]> {
  const planogramRows = await prisma.branchPlanogram.findMany({
    where: { tenantId, branchId: { in: effectiveBranchIds } },
    select: { branchId: true, modelId: true },
  });

  const modelIdsByBranch = new Map<string, string[]>();
  for (const branchId of effectiveBranchIds) {
    modelIdsByBranch.set(branchId, []);
  }
  for (const row of planogramRows) {
    modelIdsByBranch.get(row.branchId)?.push(row.modelId);
  }

  return effectiveBranchIds.map((branchId) => {
    const planogramModelIds = modelIdsByBranch.get(branchId) ?? [];
    return {
      branchId,
      // Empty planogram ⇒ every unit at the branch is off-planogram.
      ...(planogramModelIds.length > 0
        ? { serialNumber: { modelId: { notIn: planogramModelIds } } }
        : {}),
    };
  });
}

async function buildInventoryWhere(
  tenantId: string,
  branchIds: string[],
  filters?: InventoryListFilters,
): Promise<Prisma.BranchInventoryWhereInput | null> {
  const effectiveBranchIds = filters?.branchId
    ? branchIds.filter((id) => id === filters.branchId)
    : branchIds;

  if (effectiveBranchIds.length === 0) {
    return null;
  }

  const base: Prisma.BranchInventoryWhereInput = {
    tenantId,
    ...(filters?.skuCode
      ? { serialNumber: { model: { skuCode: filters.skuCode } } }
      : {}),
    ...(filters?.statusCodeId ? { statusCodeId: filters.statusCodeId } : {}),
  };

  if (filters?.offPlanogramOnly) {
    return {
      ...base,
      OR: await buildOffPlanogramBranchOr(tenantId, effectiveBranchIds),
    };
  }

  return {
    ...base,
    branchId: { in: effectiveBranchIds },
  };
}

function resolveEffectiveBranchIds(
  branchIds: string[],
  filters?: InventoryListFilters,
): string[] {
  return filters?.branchId
    ? branchIds.filter((id) => id === filters.branchId)
    : branchIds;
}

export type LatestAcceptedDelivery = {
  serialNumberId: string;
  deliveryNo: string;
  deliveryDate: Date;
};

export const inventoryRepository = {
  async listByBranches(
    tenantId: string,
    branchIds: string[],
    pagination?: { page?: number; limit?: number },
    filters?: InventoryListFilters,
    sort?: { field?: InventoryListSort; dir?: InventoryListSortDir },
  ): Promise<PaginatedResult<InventoryListRow>> {
    if (branchIds.length === 0) {
      const { limit, page } = resolvePagination(pagination);
      return toPaginatedResult<InventoryListRow>([], 0, page, limit);
    }

    const { limit, page, skip } = resolvePagination(pagination);
    const where = await buildInventoryWhere(tenantId, branchIds, filters);
    if (!where) {
      return toPaginatedResult<InventoryListRow>([], 0, page, limit);
    }

    const sortField = sort?.field ?? "updatedAt";
    const sortDir = sort?.dir ?? "desc";

    if (sortField === "updatedAt") {
      const [items, total] = await Promise.all([
        prisma.branchInventory.findMany({
          where,
          include: inventoryListInclude,
          orderBy: { updatedAt: sortDir },
          skip,
          take: limit,
        }),
        prisma.branchInventory.count({ where }),
      ]);
      return toPaginatedResult(items as InventoryListRow[], total, page, limit);
    }

    // Aging / DR# require delivery enrichment before sort + page slice.
    const [candidates, total] = await Promise.all([
      prisma.branchInventory.findMany({
        where,
        select: {
          id: true,
          serialNumberId: true,
          createdAt: true,
        },
      }),
      prisma.branchInventory.count({ where }),
    ]);

    if (candidates.length === 0) {
      return toPaginatedResult<InventoryListRow>([], 0, page, limit);
    }

    const deliveries = await this.findLatestAcceptedDeliveries(
      tenantId,
      candidates.map((c: { serialNumberId: string }) => c.serialNumberId),
    );
    const deliveryBySerial = new Map(
      deliveries.map((d) => [d.serialNumberId, d] as const),
    );

    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const ranked = candidates
      .map((c: { id: string; serialNumberId: string; createdAt: Date }) => {
        const delivery = deliveryBySerial.get(c.serialNumberId);
        const agingAnchor = delivery?.deliveryDate ?? c.createdAt;
        const agingDays = Math.max(
          0,
          Math.floor((nowMs - agingAnchor.getTime()) / dayMs),
        );
        return {
          id: c.id,
          agingDays,
          deliveryNo: delivery?.deliveryNo ?? "",
        };
      })
      .sort(
        (
          a: { id: string; agingDays: number; deliveryNo: string },
          b: { id: string; agingDays: number; deliveryNo: string },
        ) => {
          const mul = sortDir === "asc" ? 1 : -1;
          if (sortField === "dr") {
            // Rows without DR# always sort last.
            if (!a.deliveryNo && b.deliveryNo) return 1;
            if (a.deliveryNo && !b.deliveryNo) return -1;
            if (!a.deliveryNo && !b.deliveryNo) {
              return (a.agingDays - b.agingDays) * mul;
            }
            const cmp = a.deliveryNo.localeCompare(b.deliveryNo, undefined, {
              numeric: true,
              sensitivity: "base",
            });
            if (cmp !== 0) return cmp * mul;
            return (a.agingDays - b.agingDays) * mul;
          }
          return (a.agingDays - b.agingDays) * mul;
        },
      );

    const pageIds = ranked.slice(skip, skip + limit).map((r: { id: string }) => r.id);
    if (pageIds.length === 0) {
      return toPaginatedResult<InventoryListRow>([], total, page, limit);
    }

    const items = await prisma.branchInventory.findMany({
      where: { id: { in: pageIds } },
      include: inventoryListInclude,
    });
    const byId = new Map(
      (items as InventoryListRow[]).map((item) => [item.id, item]),
    );
    const ordered = pageIds
      .map((id: string) => byId.get(id))
      .filter(
        (item: InventoryListRow | undefined): item is InventoryListRow =>
          Boolean(item),
      );

    return toPaginatedResult(ordered, total, page, limit);
  },

  async findLatestAcceptedDeliveries(
    tenantId: string,
    serialNumberIds: string[],
  ): Promise<LatestAcceptedDelivery[]> {
    if (serialNumberIds.length === 0) return [];

    const lines = await prisma.branchDeliveryLine.findMany({
      where: {
        serialNumberId: { in: serialNumberIds },
        delivery: {
          tenantId,
          OR: [
            { acceptedAt: { not: null } },
            { statusCode: { code: "accepted" } },
          ],
        },
      },
      select: {
        serialNumberId: true,
        delivery: {
          select: {
            deliveryNo: true,
            acceptedAt: true,
            createdAt: true,
          },
        },
      },
    });

    type DeliveryLineRow = {
      serialNumberId: string;
      delivery: {
        deliveryNo: string;
        acceptedAt: Date | null;
        createdAt: Date;
      };
    };

    const latest = new Map<string, LatestAcceptedDelivery>();
    for (const line of lines as DeliveryLineRow[]) {
      const deliveryDate = line.delivery.acceptedAt ?? line.delivery.createdAt;
      const existing = latest.get(line.serialNumberId);
      if (!existing || deliveryDate.getTime() > existing.deliveryDate.getTime()) {
        latest.set(line.serialNumberId, {
          serialNumberId: line.serialNumberId,
          deliveryNo: line.delivery.deliveryNo,
          deliveryDate,
        });
      }
    }
    return Array.from(latest.values());
  },

  /**
   * Aggregate inventory qty/value by SKU in SQL (GROUP BY).
   * Off-planogram uses a set-based NOT EXISTS against branch_planograms.
   */
  async aggregateSeriesBySku(
    tenantId: string,
    branchIds: string[],
    filters?: InventoryListFilters,
  ): Promise<InventorySeriesSkuAgg[]> {
    const effectiveBranchIds = resolveEffectiveBranchIds(branchIds, filters);
    if (effectiveBranchIds.length === 0) return [];

    const conditions: Prisma.Sql[] = [
      Prisma.sql`bi.tenant_id = ${tenantId}`,
      Prisma.sql`bi.branch_id IN (${Prisma.join(effectiveBranchIds)})`,
    ];

    if (filters?.skuCode) {
      conditions.push(Prisma.sql`pm.sku_code = ${filters.skuCode}`);
    }
    if (filters?.statusCodeId) {
      conditions.push(Prisma.sql`bi.status_code_id = ${filters.statusCodeId}`);
    }
    if (filters?.offPlanogramOnly) {
      // Set-based anti-join: stock whose model is not on that branch's planogram.
      conditions.push(Prisma.sql`NOT EXISTS (
        SELECT 1
        FROM branch_planograms bp
        WHERE bp.branch_id = bi.branch_id
          AND bp.model_id = sn.model_id
      )`);
    }

    const rows = await prisma.$queryRaw<SeriesSkuAggRaw[]>`
      SELECT
        pm.sku_code,
        pm.srp,
        COUNT(*)::int AS qty
      FROM branch_inventories bi
      INNER JOIN serial_numbers sn ON sn.id = bi.serial_number_id
      INNER JOIN product_models pm ON pm.id = sn.model_id
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY pm.sku_code, pm.srp
    `;

    return rows.map((row) => ({
      skuCode: row.sku_code,
      srp: row.srp,
      qty: Number(row.qty),
    }));
  },

  countAll(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve(0);
    return prisma.branchInventory.count({
      where: { tenantId, branchId: { in: branchIds } },
    });
  },

  countByStatus(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.branchInventory.groupBy({
      by: ["statusCodeId"],
      where: { tenantId, branchId: { in: branchIds } },
      _count: { id: true },
    });
  },

  updateStatus(
    tenantId: string,
    id: string,
    statusCodeId: string,
    updatedById: string,
  ) {
    return prisma.branchInventory.update({
      where: { id, tenantId },
      data: { statusCodeId, updatedById },
    });
  },

  countByStatusCode(tenantId: string, branchIds: string[], statusCodeId: string) {
    if (branchIds.length === 0) return Promise.resolve(0);
    return prisma.branchInventory.count({
      where: { tenantId, branchId: { in: branchIds }, statusCodeId },
    });
  },
};
