import { auditService } from "@/features/audit/services/audit.service";
import { STOCK_IN_SYSTEM_STATUS } from "@/features/inventory/repositories/sap-stock-placement.repository";
import { commitWarehousePlacement } from "@/features/inventory/services/warehouse-placement-commit";
import { prisma } from "@/lib/database/client";

export interface WarehouseStockInInput {
  tenantId: string;
  userId: string;
  warehouseId: string;
  locationId: string;
  modelId: string;
  serialNos: string[];
}

export interface WarehouseStockInResult {
  created: number;
  skipped: number;
  message: string;
}

export interface StockInModelOption {
  id: string;
  skuCode: string;
  name: string;
}

/**
 * Place serials into an existing warehouse location.
 *
 * Creates a serial when it is new, then writes warehouse inventory through
 * the placement writer. Order approval and SAP warehouse sync do not call this.
 */
export async function listModelsForStockIn(tenantId: string): Promise<StockInModelOption[]> {
  return prisma.productModel.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, skuCode: true, name: true },
    orderBy: { skuCode: "asc" },
  });
}

export async function stockInWarehouseLocation(
  input: WarehouseStockInInput,
): Promise<WarehouseStockInResult> {
  const placed = await commitWarehousePlacement({
    tenantId: input.tenantId,
    userId: input.userId,
    warehouseId: input.warehouseId,
    locationId: input.locationId,
    modelId: input.modelId,
    serialNos: input.serialNos,
    systemStatus: STOCK_IN_SYSTEM_STATUS,
    historyStatus: "Stock",
    historyDetails: ({ warehouseCode, locationCode }) =>
      `Stocked in to ${warehouseCode} / ${locationCode}`,
  });

  await auditService.log({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "warehouse.stocked_in",
    entityType: "WarehouseLocation",
    entityId: input.locationId,
    metadata: {
      warehouseCode: placed.warehouseCode,
      locationCode: placed.locationCode,
      skuCode: placed.skuCode,
      created: placed.created,
      skipped: placed.skipped,
      serialNos: placed.serialNos,
    },
  });

  const noun = placed.created === 1 ? "serial" : "serials";
  return {
    created: placed.created,
    skipped: placed.skipped,
    message:
      placed.created === 0
        ? "Those serials are already in this location. Nothing new was added."
        : `Stocked in ${placed.created} ${noun} at ${placed.warehouseCode} / ${placed.locationCode}.`,
  };
}
