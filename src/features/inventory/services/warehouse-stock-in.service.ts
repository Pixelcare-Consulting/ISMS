import { auditService } from "@/features/audit/services/audit.service";
import {
  sapStockPlacementRepository,
  STOCK_IN_SYSTEM_STATUS,
} from "@/features/inventory/repositories/sap-stock-placement.repository";
import { newWarehouseSerialIds } from "@/features/inventory/services/warehouse-receive.rules";
import { planWarehouseStockIn } from "@/features/inventory/services/warehouse-stock-in.rules";
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
  const location = await prisma.warehouseLocation.findFirst({
    where: {
      id: input.locationId,
      warehouse: { id: input.warehouseId, tenantId: input.tenantId, deletedAt: null },
    },
    select: {
      id: true,
      code: true,
      warehouseId: true,
      warehouse: { select: { id: true, code: true } },
    },
  });

  const model = await prisma.productModel.findFirst({
    where: { id: input.modelId, tenantId: input.tenantId, deletedAt: null },
    select: { id: true, skuCode: true },
  });
  if (!model) throw new Error("Model not found.");

  const serialNos = [...new Set(input.serialNos.map((serial) => serial.trim()).filter(Boolean))];
  const existingSerials = serialNos.length
    ? await prisma.serialNumber.findMany({
        where: { tenantId: input.tenantId, serialNo: { in: serialNos } },
        select: { id: true, serialNo: true, modelId: true, deletedAt: true },
      })
    : [];

  const alreadyThere = existingSerials.length
    ? await prisma.warehouseInventory.findMany({
        where: {
          tenantId: input.tenantId,
          serialNumberId: { in: existingSerials.map((row) => row.id) },
        },
        select: { serialNumberId: true },
      })
    : [];

  const decision = planWarehouseStockIn({
    warehouseId: input.warehouseId,
    locationWarehouseId: location?.warehouseId ?? null,
    modelId: model.id,
    serialNos,
    existing: existingSerials.map((row) => ({
      id: row.id,
      serialNo: row.serialNo,
      modelId: row.modelId,
      deleted: row.deletedAt != null,
    })),
    warehouseSerialIds: alreadyThere.map((row) => row.serialNumberId),
  });
  if (!decision.ok) throw new Error(decision.error);
  if (!location) throw new Error("That location is not in this warehouse.");

  if (decision.plan.createSerialNos.length > 0) {
    await prisma.serialNumber.createMany({
      data: decision.plan.createSerialNos.map((serialNo) => ({
        tenantId: input.tenantId,
        serialNo,
        modelId: model.id,
        createdById: input.userId,
      })),
      skipDuplicates: true,
    });
  }

  const serials = await prisma.serialNumber.findMany({
    where: { tenantId: input.tenantId, serialNo: { in: serialNos }, deletedAt: null },
    select: { id: true, serialNo: true },
  });
  if (serials.length !== serialNos.length) {
    throw new Error("Stock-in could not register every serial.");
  }

  const held = await prisma.warehouseInventory.findMany({
    where: { tenantId: input.tenantId, serialNumberId: { in: serials.map((row) => row.id) } },
    select: { serialNumberId: true },
  });
  const freshIds = newWarehouseSerialIds(
    held.map((row) => row.serialNumberId),
    serials.map((row) => row.id),
  );

  const seenAt = new Date();
  const created = await sapStockPlacementRepository.createWarehouseUnits(
    input.tenantId,
    location.id,
    freshIds,
    seenAt,
    STOCK_IN_SYSTEM_STATUS,
  );
  const skipped = serialNos.length - created;

  if (created > 0) {
    const placed = new Set(freshIds);
    await prisma.serialNumberHistory.createMany({
      data: serials
        .filter((row) => placed.has(row.id))
        .map((row) => ({
          tenantId: input.tenantId,
          serialNumberId: row.id,
          txnType: "grpo" as const,
          details: `Stocked in to ${location.warehouse.code} / ${location.code}`,
          status: "Stock",
          createdById: input.userId,
        })),
    });
  }

  await auditService.log({
    tenantId: input.tenantId,
    userId: input.userId,
    action: "warehouse.stocked_in",
    entityType: "WarehouseLocation",
    entityId: location.id,
    metadata: {
      warehouseCode: location.warehouse.code,
      locationCode: location.code,
      skuCode: model.skuCode,
      created,
      skipped,
      serialNos,
    },
  });

  const noun = created === 1 ? "serial" : "serials";
  return {
    created,
    skipped,
    message:
      created === 0
        ? "Those serials are already in the warehouse. Nothing new was added."
        : `Stocked in ${created} ${noun} at ${location.warehouse.code} / ${location.code}.`,
  };
}
