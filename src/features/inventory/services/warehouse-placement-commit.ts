import { sapStockPlacementRepository } from "@/features/inventory/repositories/sap-stock-placement.repository";
import {
  lockSerialNumbers,
  lockSerialRegistrations,
  loadCurrentPlacements,
} from "@/features/inventory/services/serial-placement";
import { planWarehouseStockIn } from "@/features/inventory/services/warehouse-stock-in.rules";
import { prisma } from "@/lib/database/client";

export interface WarehousePlacementCommitInput {
  tenantId: string;
  userId: string | null;
  warehouseId: string;
  locationId: string;
  modelId: string;
  serialNos: string[];
  systemStatus: string;
  historyDetails: (place: { warehouseCode: string; locationCode: string }) => string;
  historyStatus: string;
}

export interface WarehousePlacementCommitResult {
  created: number;
  skipped: number;
  warehouseCode: string;
  locationCode: string;
  skuCode: string;
  serialNos: string[];
}

/**
 * Register and place warehouse stock in one transaction.
 * The same location and model writes nothing. Any other placement rolls the
 * whole batch back, including serials registered in this request.
 */
export async function commitWarehousePlacement(
  input: WarehousePlacementCommitInput,
): Promise<WarehousePlacementCommitResult> {
  const serialNos = [...new Set(input.serialNos.map((serial) => serial.trim()).filter(Boolean))];
  if (serialNos.length === 0) {
    throw new Error("Enter at least one serial number.");
  }

  return prisma.$transaction(async (tx) => {
    const location = await tx.warehouseLocation.findFirst({
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
    const model = await tx.productModel.findFirst({
      where: { id: input.modelId, tenantId: input.tenantId, deletedAt: null },
      select: { id: true, skuCode: true },
    });
    if (!model) throw new Error("Model not found.");
    if (!location) throw new Error("That location is not in this warehouse.");

    await lockSerialRegistrations(
      tx,
      serialNos.map((serialNo) => ({ tenantId: input.tenantId, serialNo })),
    );

    if (serialNos.length > 0) {
      await tx.serialNumber.createMany({
        data: serialNos.map((serialNo) => ({
          tenantId: input.tenantId,
          serialNo,
          modelId: model.id,
          createdById: input.userId,
        })),
        skipDuplicates: true,
      });
    }

    const serials = await tx.serialNumber.findMany({
      where: { tenantId: input.tenantId, serialNo: { in: serialNos } },
      select: {
        id: true,
        serialNo: true,
        tenantId: true,
        modelId: true,
        deletedAt: true,
      },
    });
    const byNo = new Map(serials.map((row) => [row.serialNo, row]));
    for (const serialNo of serialNos) {
      const row = byNo.get(serialNo);
      if (!row || row.tenantId !== input.tenantId) {
        throw new Error("Stock-in could not register every serial.");
      }
      if (row.modelId !== model.id) {
        throw new Error(`${serialNo} already belongs to a different model.`);
      }
      if (row.deletedAt) {
        throw new Error(`${serialNo} is retired and cannot be stocked in.`);
      }
    }

    const serialIds = serials.map((row) => row.id);
    await lockSerialNumbers(tx, serialIds);
    const placements = await loadCurrentPlacements(tx, serialIds);
    const decision = planWarehouseStockIn({
      warehouseId: input.warehouseId,
      locationWarehouseId: location.warehouseId,
      locationId: location.id,
      modelId: model.id,
      tenantId: input.tenantId,
      serialNos,
      existing: serials.map((row) => ({
        id: row.id,
        serialNo: row.serialNo,
        modelId: row.modelId,
        tenantId: row.tenantId,
        deleted: row.deletedAt != null,
      })),
      occupancy: placements.map((row) => ({
        serialNumberId: row.serialNumberId,
        table: row.table,
        warehouseLocationId: row.warehouseLocationId,
        place: row.place,
      })),
    });
    if (!decision.ok) throw new Error(decision.error);

    const placeIds = [
      ...decision.plan.placeExistingIds,
      ...decision.plan.createSerialNos.map((serialNo) => {
        const row = byNo.get(serialNo);
        if (!row) throw new Error("Stock-in could not register every serial.");
        return row.id;
      }),
    ];

    const created = await sapStockPlacementRepository.createWarehouseUnits(
      tx,
      input.tenantId,
      location.id,
      placeIds,
      new Date(),
      input.systemStatus,
    );
    if (created !== placeIds.length) {
      throw new Error("Stock-in did not place every serial.");
    }

    if (created > 0) {
      await tx.serialNumberHistory.createMany({
        data: placeIds.map((serialNumberId) => ({
          tenantId: input.tenantId,
          serialNumberId,
          txnType: "grpo" as const,
          details: input.historyDetails({
            warehouseCode: location.warehouse.code,
            locationCode: location.code,
          }),
          status: input.historyStatus,
          createdById: input.userId,
        })),
      });
    }

    const skipped = decision.plan.skippedSerialNos.length;
    if (created + skipped !== serialNos.length) {
      throw new Error("Stock-in counts did not match the serials in this request.");
    }

    return {
      created,
      skipped,
      warehouseCode: location.warehouse.code,
      locationCode: location.code,
      skuCode: model.skuCode,
      serialNos,
    };
  });
}
