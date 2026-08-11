import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginatedResult,
} from "@/lib/shared/pagination";

export type WarehouseInventoryListRow = {
  id: string;
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

    const [items, total] = await Promise.all([
      prisma.warehouseInventory.findMany({
        where,
        include: listInclude,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.warehouseInventory.count({ where }),
    ]);

    return toPaginatedResult(
      items as WarehouseInventoryListRow[],
      total,
      page,
      limit,
    );
  },

  listFilterWarehouses(tenantId: string, warehouseIds: string[]) {
    if (warehouseIds.length === 0) {
      return Promise.resolve(
        [] as { id: string; code: string; name: string }[],
      );
    }
    return prisma.warehouse.findMany({
      where: { tenantId, id: { in: warehouseIds } },
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
