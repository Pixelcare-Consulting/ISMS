import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

const inventoryListInclude = {
  branch: { select: { id: true, name: true, sapCode: true } },
  statusCode: { select: { id: true, code: true, name: true } },
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
} satisfies Prisma.BranchInventoryInclude;

export type InventoryListSort = "updatedAt" | "aging" | "dr";
export type InventoryListSortDir = "asc" | "desc";

export type InventoryListFilters = {
  branchId?: string;
  skuCode?: string;
  statusCodeId?: string;
  offPlanogramOnly?: boolean;
};

function buildInventoryWhere(
  tenantId: string,
  branchIds: string[],
  filters?: InventoryListFilters,
): Prisma.BranchInventoryWhereInput | null {
  const effectiveBranchIds = filters?.branchId
    ? branchIds.filter((id) => id === filters.branchId)
    : branchIds;

  if (effectiveBranchIds.length === 0) {
    return null;
  }

  return {
    tenantId,
    ...(filters?.skuCode
      ? { serialNumber: { model: { skuCode: filters.skuCode } } }
      : {}),
    ...(filters?.statusCodeId ? { statusCodeId: filters.statusCodeId } : {}),
    ...(filters?.offPlanogramOnly
      ? {
          // Off-planogram = model not in THIS branch's planogram. Build a
          // per-branch OR so the filter (and paging/totals) run in the DB.
          OR: effectiveBranchIds.map((branchId) => ({
            branchId,
            serialNumber: {
              model: { branchPlanograms: { none: { branchId } } },
            },
          })),
        }
      : { branchId: { in: effectiveBranchIds } }),
  };
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
  ) {
    if (branchIds.length === 0) {
      const { limit, page } = resolvePagination(pagination);
      return toPaginatedResult([], 0, page, limit);
    }

    const { limit, page, skip } = resolvePagination(pagination);
    const where = buildInventoryWhere(tenantId, branchIds, filters);
    if (!where) {
      return toPaginatedResult([], 0, page, limit);
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
      return toPaginatedResult(items, total, page, limit);
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
      return toPaginatedResult([], 0, page, limit);
    }

    const deliveries = await this.findLatestAcceptedDeliveries(
      tenantId,
      candidates.map((c) => c.serialNumberId),
    );
    const deliveryBySerial = new Map(
      deliveries.map((d) => [d.serialNumberId, d] as const),
    );

    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const ranked = candidates
      .map((c) => {
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
      .sort((a, b) => {
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
      });

    const pageIds = ranked.slice(skip, skip + limit).map((r) => r.id);
    if (pageIds.length === 0) {
      return toPaginatedResult([], total, page, limit);
    }

    const items = await prisma.branchInventory.findMany({
      where: { id: { in: pageIds } },
      include: inventoryListInclude,
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    const ordered = pageIds
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

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

    const latest = new Map<string, LatestAcceptedDelivery>();
    for (const line of lines) {
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

  async listSeriesRows(
    tenantId: string,
    branchIds: string[],
    filters?: InventoryListFilters,
  ) {
    if (branchIds.length === 0) return [];
    const where = buildInventoryWhere(tenantId, branchIds, filters);
    if (!where) return [];

    return prisma.branchInventory.findMany({
      where,
      select: {
        serialNumber: {
          select: {
            model: {
              select: {
                skuCode: true,
                srp: true,
              },
            },
          },
        },
      },
    });
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
