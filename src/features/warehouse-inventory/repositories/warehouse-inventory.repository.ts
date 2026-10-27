import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginatedResult,
} from "@/lib/shared/pagination";

export type WarehouseInventoryListRow = {
  id: string;
  /**
   * WAREHOUSE: warehouse stock (returns, transfers back). BRANCH: branch stock
   * with a location in this warehouse; it stays at its branch.
   */
  source: "WAREHOUSE" | "BRANCH";
  /** Set for BRANCH rows: the branch that holds the unit. */
  branch: { name: string; sapCode: string | null } | null;
  systemStatus: string | null;
  updatedAt: Date;
  serialNumber: {
    id: string;
    serialNo: string;
    model: {
      id: string;
      skuCode: string;
      name: string;
      brand: { name: string } | null;
    };
  };
  warehouseLocation: {
    id: string;
    code: string;
    name: string;
    warehouse: { id: string; code: string; name: string };
  };
};

export type WarehouseInventoryListFilters = {
  warehouseId?: string;
  locationId?: string;
  q?: string;
};

const listInclude = {
  serialNumber: {
    select: {
      id: true,
      serialNo: true,
      model: {
        select: {
          id: true,
          skuCode: true,
          name: true,
          brand: { select: { name: true } },
        },
      },
    },
  },
  warehouseLocation: {
    select: {
      id: true,
      code: true,
      name: true,
      warehouse: { select: { id: true, code: true, name: true } },
    },
  },
} as const;

function searchWhere(q: string | undefined) {
  const term = q?.trim();
  if (!term) return {};
  return {
    OR: [
      { serialNumber: { serialNo: { contains: term, mode: "insensitive" as const } } },
      { serialNumber: { model: { skuCode: { contains: term, mode: "insensitive" as const } } } },
    ],
  };
}

function scopeWarehouseIds(warehouseIds: string[], filters?: WarehouseInventoryListFilters) {
  return filters?.warehouseId
    ? warehouseIds.filter((id) => id === filters.warehouseId)
    : warehouseIds;
}

function buildBranchWhere(
  tenantId: string,
  warehouseIds: string[],
  filters?: WarehouseInventoryListFilters,
): Prisma.BranchInventoryWhereInput | null {
  const scoped = scopeWarehouseIds(warehouseIds, filters);
  if (scoped.length === 0) return null;
  return {
    tenantId,
    warehouseLocation: {
      warehouseId: { in: scoped },
      ...(filters?.locationId ? { id: filters.locationId } : {}),
    },
    ...searchWhere(filters?.q),
  };
}

const branchListInclude = {
  ...listInclude,
  branch: { select: { name: true, sapCode: true } },
  statusCode: { select: { name: true } },
} as const;

function buildWhere(
  tenantId: string,
  warehouseIds: string[],
  filters?: WarehouseInventoryListFilters,
): Prisma.WarehouseInventoryWhereInput | null {
  const scopedWarehouseIds = filters?.warehouseId
    ? warehouseIds.filter((id) => id === filters.warehouseId)
    : warehouseIds;

  if (scopedWarehouseIds.length === 0) {
    return null;
  }

  const q = filters?.q?.trim();

  return {
    tenantId,
    warehouseLocation: {
      warehouseId: { in: scopedWarehouseIds },
      ...(filters?.locationId ? { id: filters.locationId } : {}),
    },
    ...(q
      ? {
          OR: [
            { serialNumber: { serialNo: { contains: q, mode: "insensitive" } } },
            {
              serialNumber: {
                model: { skuCode: { contains: q, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };
}

export const warehouseInventoryRepository = {
  async listByWarehouses(
    tenantId: string,
    warehouseIds: string[],
    pagination?: { page?: number; limit?: number },
    filters?: WarehouseInventoryListFilters,
  ): Promise<PaginatedResult<WarehouseInventoryListRow>> {
    const { page, limit, skip } = resolvePagination(pagination);

    if (warehouseIds.length === 0) {
      return toPaginatedResult<WarehouseInventoryListRow>([], 0, page, limit);
    }

    const where = buildWhere(tenantId, warehouseIds, filters);
    if (!where) {
      return toPaginatedResult<WarehouseInventoryListRow>([], 0, page, limit);
    }

    const branchWhere = buildBranchWhere(tenantId, warehouseIds, filters);

    // Two sources, one list: warehouse rows first, then located branch stock.
    // The page window is cut across both so each query only reads its share.
    const [warehouseTotal, branchTotal] = await Promise.all([
      prisma.warehouseInventory.count({ where }),
      branchWhere ? prisma.branchInventory.count({ where: branchWhere }) : Promise.resolve(0),
    ]);
    const warehouseTake = Math.max(0, Math.min(limit, warehouseTotal - skip));
    const branchSkip = Math.max(0, skip - warehouseTotal);
    const branchTake = limit - warehouseTake;

    const [warehouseRows, branchRows] = await Promise.all([
      warehouseTake > 0
        ? prisma.warehouseInventory.findMany({
            where,
            include: listInclude,
            orderBy: { updatedAt: "desc" },
            skip,
            take: warehouseTake,
          })
        : Promise.resolve([]),
      branchWhere && branchTake > 0
        ? prisma.branchInventory.findMany({
            where: branchWhere,
            include: branchListInclude,
            orderBy: { updatedAt: "desc" },
            skip: branchSkip,
            take: branchTake,
          })
        : Promise.resolve([]),
    ]);

    const items: WarehouseInventoryListRow[] = [
      ...warehouseRows.map((row) => ({
        id: row.id,
        source: "WAREHOUSE" as const,
        branch: null,
        systemStatus: row.systemStatus,
        updatedAt: row.updatedAt,
        serialNumber: row.serialNumber,
        warehouseLocation: row.warehouseLocation,
      })),
      ...branchRows.flatMap((row) =>
        row.warehouseLocation
          ? [
              {
                id: row.id,
                source: "BRANCH" as const,
                branch: row.branch,
                systemStatus: row.statusCode.name,
                updatedAt: row.updatedAt,
                serialNumber: row.serialNumber,
                warehouseLocation: row.warehouseLocation,
              },
            ]
          : [],
      ),
    ];

    return toPaginatedResult(items, warehouseTotal + branchTotal, page, limit);
  },

  listFilterWarehouses(tenantId: string, warehouseIds: string[]) {
    if (warehouseIds.length === 0) {
      return Promise.resolve(
        [] as { id: string; code: string; name: string }[],
      );
    }
    return prisma.warehouse.findMany({
      where: { tenantId, id: { in: warehouseIds }, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    });
  },

  listFilterLocations(tenantId: string, warehouseIds: string[], warehouseId?: string) {
    const scoped = warehouseId
      ? warehouseIds.filter((id) => id === warehouseId)
      : warehouseIds;

    if (scoped.length === 0) {
      return Promise.resolve(
        [] as {
          id: string;
          code: string;
          name: string;
          warehouseId: string;
        }[],
      );
    }

    return prisma.warehouseLocation.findMany({
      where: {
        warehouseId: { in: scoped },
        warehouse: { tenantId },
      },
      select: { id: true, code: true, name: true, warehouseId: true },
      orderBy: [{ warehouseId: "asc" }, { code: "asc" }],
    });
  },
};
