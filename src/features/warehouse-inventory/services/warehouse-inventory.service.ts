import { aorService } from "@/features/aors/services/aor.service";
import { warehouseRepository } from "@/features/warehouses/repositories/warehouse.repository";
import {
  warehouseInventoryRepository,
  type WarehouseInventoryListFilters,
  type WarehouseInventoryListRow,
} from "@/features/warehouse-inventory/repositories/warehouse-inventory.repository";
import type { PaginatedResult } from "@/lib/shared/pagination";

export type WarehouseInventoryListOptions = WarehouseInventoryListFilters;

export type WarehouseFilterOption = {
  id: string;
  code: string;
  name: string;
};

export type WarehouseLocationFilterOption = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
};

async function resolveWarehouseIds(
  tenantId: string,
  userId: string,
  isUnrestricted: boolean,
): Promise<string[]> {
  if (isUnrestricted) {
    const warehouses = await warehouseRepository.listByTenant(tenantId);
    return warehouses.map((w) => w.id);
  }
  return aorService.getWarehouseIdsForUser(tenantId, userId);
}

export const warehouseInventoryService = {
  async listForUser(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    pagination?: { page?: number; limit?: number },
    filters?: WarehouseInventoryListOptions,
  ): Promise<PaginatedResult<WarehouseInventoryListRow>> {
    const warehouseIds = await resolveWarehouseIds(
      tenantId,
      userId,
      isUnrestricted,
    );
    return warehouseInventoryRepository.listByWarehouses(
      tenantId,
      warehouseIds,
      pagination,
      filters,
    );
  },

  async listFilterOptions(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    warehouseId?: string,
  ): Promise<{
    warehouses: WarehouseFilterOption[];
    locations: WarehouseLocationFilterOption[];
  }> {
    const warehouseIds = await resolveWarehouseIds(
      tenantId,
      userId,
      isUnrestricted,
    );
    const [warehouses, locations] = await Promise.all([
      warehouseInventoryRepository.listFilterWarehouses(tenantId, warehouseIds),
      warehouseInventoryRepository.listFilterLocations(
        tenantId,
        warehouseIds,
        warehouseId,
      ),
    ]);
    return { warehouses, locations };
  },
};
