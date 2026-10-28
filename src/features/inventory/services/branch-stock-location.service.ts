import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { prisma } from "@/lib/database/client";

/**
 * Change the warehouse location of a unit that already has one.
 *
 * Stock comes from SAP; ISMS has no stock-in that gives a unit its first location. These
 * only relabel units that already sit in a location (rows from before Stock in was
 * removed, and units returned or transferred back into a warehouse location).
 */

export interface MoveTaggedSerialInput {
  tenantId: string;
  userId: string;
  branchInventoryId: string;
  locationId: string;
}

/** Move a tagged branch unit to another location in the same warehouse. */
export async function moveTaggedSerial(
  input: MoveTaggedSerialInput,
): Promise<{ serialNo: string; from: string; to: string; moved: boolean }> {
  return prisma.$transaction(async (tx) => {
    const head = await tx.branchInventory.findFirst({
      where: { id: input.branchInventoryId, tenantId: input.tenantId },
      select: { serialNumberId: true },
    });
    if (!head) throw new Error("This unit is no longer in branch stock.");
    await lockSerialNumbers(tx, [head.serialNumberId]);

    const row = await tx.branchInventory.findFirst({
      where: { id: input.branchInventoryId, tenantId: input.tenantId },
      select: {
        serialNumberId: true,
        serialNumber: { select: { serialNo: true } },
        warehouseLocation: {
          select: { id: true, code: true, warehouseId: true, warehouse: { select: { code: true } } },
        },
      },
    });
    if (!row?.warehouseLocation) throw new Error("This unit has no location to change.");
    const current = row.warehouseLocation;
    const serialNo = row.serialNumber.serialNo;
    if (current.id === input.locationId) return { serialNo, from: current.code, to: current.code, moved: false };

    const target = await tx.warehouseLocation.findFirst({
      where: { id: input.locationId, warehouse: { tenantId: input.tenantId } },
      select: { code: true, warehouseId: true },
    });
    if (!target) throw new Error("That location was not found.");
    if (target.warehouseId !== current.warehouseId) {
      throw new Error("Choose a location in the same warehouse.");
    }

    await tx.branchInventory.update({
      where: { id: input.branchInventoryId },
      data: { warehouseLocationId: input.locationId, updatedById: input.userId },
    });
    await tx.serialNumberHistory.create({
      data: {
        tenantId: input.tenantId,
        serialNumberId: row.serialNumberId,
        txnType: "inv_status_update",
        details: `Moved within ${current.warehouse.code} from ${current.code} to ${target.code}`,
        status: null,
        createdById: input.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        action: "warehouse.branch_stock_location_changed",
        entityType: "BranchInventory",
        entityId: input.branchInventoryId,
        metadata: { serialNo, warehouseCode: current.warehouse.code, from: current.code, to: target.code },
      },
    });
    return { serialNo, from: current.code, to: target.code, moved: true };
  });
}

/** Move a warehouse-stock unit (returns, transfers back) to another location in its warehouse. */
export async function moveWarehouseUnit(
  input: Omit<MoveTaggedSerialInput, "branchInventoryId"> & { warehouseInventoryId: string },
): Promise<{ serialNo: string; from: string; to: string; moved: boolean }> {
  return prisma.$transaction(async (tx) => {
    const head = await tx.warehouseInventory.findFirst({
      where: { id: input.warehouseInventoryId, tenantId: input.tenantId },
      select: { serialNumberId: true },
    });
    if (!head) throw new Error("This unit is no longer in warehouse stock.");
    await lockSerialNumbers(tx, [head.serialNumberId]);

    const row = await tx.warehouseInventory.findFirst({
      where: { id: input.warehouseInventoryId, tenantId: input.tenantId },
      select: {
        serialNumberId: true,
        serialNumber: { select: { serialNo: true } },
        warehouseLocation: {
          select: { id: true, code: true, warehouseId: true, warehouse: { select: { code: true } } },
        },
      },
    });
    if (!row) throw new Error("This unit is no longer in warehouse stock.");
    const current = row.warehouseLocation;
    const serialNo = row.serialNumber.serialNo;
    if (current.id === input.locationId) return { serialNo, from: current.code, to: current.code, moved: false };

    const target = await tx.warehouseLocation.findFirst({
      where: { id: input.locationId, warehouse: { tenantId: input.tenantId } },
      select: { code: true, warehouseId: true },
    });
    if (!target) throw new Error("That location was not found.");
    if (target.warehouseId !== current.warehouseId) {
      throw new Error("Choose a location in the same warehouse.");
    }

    await tx.warehouseInventory.update({
      where: { id: input.warehouseInventoryId },
      data: { warehouseLocationId: input.locationId, systemUpdatedAt: new Date() },
    });
    await tx.serialNumberHistory.create({
      data: {
        tenantId: input.tenantId,
        serialNumberId: row.serialNumberId,
        txnType: "inv_status_update",
        details: `Moved within ${current.warehouse.code} from ${current.code} to ${target.code}`,
        status: "Warehouse",
        createdById: input.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        action: "warehouse.unit_location_changed",
        entityType: "WarehouseInventory",
        entityId: input.warehouseInventoryId,
        metadata: { serialNo, warehouseCode: current.warehouse.code, from: current.code, to: target.code },
      },
    });
    return { serialNo, from: current.code, to: target.code, moved: true };
  });
}
