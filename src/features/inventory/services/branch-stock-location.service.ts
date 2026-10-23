import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { prisma } from "@/lib/database/client";

/**
 * Warehouse locations for branch stock.
 *
 * Serials come from SAP; ISMS never creates them here. A warehouse "Stock in"
 * tags branch units with a shelf location in that warehouse. The branches
 * covered are those whose primary warehouse is this warehouse. A tagged unit
 * stays branch stock (it can still be sold); the location is a label.
 */

/** Units physically on the shelf. Sold, official sold and in-transit units are not. */
export const SHELF_STATUS_CODES = ["STK", "RSV", "DEF", "FPO"] as const;

/** Taggable = on the shelf at a branch fed by this warehouse, and not tagged yet. */
function untaggedShelfWhere(tenantId: string, warehouseId: string) {
  return {
    tenantId,
    warehouseLocationId: null,
    branch: { primaryWarehouseId: warehouseId, deletedAt: null },
    statusCode: { code: { in: [...SHELF_STATUS_CODES] } },
    serialNumber: { deletedAt: null },
  };
}

export interface TaggableModel {
  id: string;
  skuCode: string;
  name: string;
  untaggedCount: number;
}

export async function listTaggableModels(
  tenantId: string,
  warehouseId: string,
): Promise<TaggableModel[]> {
  const rows = await prisma.branchInventory.findMany({
    where: untaggedShelfWhere(tenantId, warehouseId),
    select: { serialNumber: { select: { model: { select: { id: true, skuCode: true, name: true } } } } },
  });
  const byModel = new Map<string, TaggableModel>();
  for (const row of rows) {
    const model = row.serialNumber.model;
    const entry = byModel.get(model.id) ?? { ...model, untaggedCount: 0 };
    entry.untaggedCount += 1;
    byModel.set(model.id, entry);
  }
  return [...byModel.values()].sort((a, b) => a.skuCode.localeCompare(b.skuCode));
}

export async function listTaggableSerials(
  tenantId: string,
  warehouseId: string,
  modelId: string,
): Promise<string[]> {
  const rows = await prisma.branchInventory.findMany({
    where: {
      ...untaggedShelfWhere(tenantId, warehouseId),
      serialNumber: { deletedAt: null, modelId },
    },
    select: { serialNumber: { select: { serialNo: true } } },
    orderBy: { serialNumber: { serialNo: "asc" } },
  });
  return rows.map((row) => row.serialNumber.serialNo);
}

export interface TagSerialsInput {
  tenantId: string;
  userId: string;
  warehouseId: string;
  locationId: string;
  modelId: string;
  serialNos: string[];
}

export interface TagSerialsResult {
  tagged: number;
  skipped: number;
  message: string;
}

const MAX_LISTED = 5;

function listSome(serialNos: string[]): string {
  const shown = serialNos.slice(0, MAX_LISTED).join(", ");
  return serialNos.length > MAX_LISTED ? `${shown} and ${serialNos.length - MAX_LISTED} more` : shown;
}

async function requireLocation(tenantId: string, warehouseId: string, locationId: string) {
  const location = await prisma.warehouseLocation.findFirst({
    where: { id: locationId, warehouseId, warehouse: { tenantId, deletedAt: null } },
    select: { code: true, warehouse: { select: { code: true } } },
  });
  if (!location) throw new Error("That location is not in this warehouse.");
  return location;
}

/** Tag branch units with a location. All or nothing: any serial that cannot be tagged stops the save. */
export async function tagSerialsToLocation(input: TagSerialsInput): Promise<TagSerialsResult> {
  const serialNos = [...new Set(input.serialNos)];
  if (serialNos.length === 0) throw new Error("Enter at least one serial number.");
  const location = await requireLocation(input.tenantId, input.warehouseId, input.locationId);

  return prisma.$transaction(async (tx) => {
    const serials = await tx.serialNumber.findMany({
      where: { tenantId: input.tenantId, serialNo: { in: serialNos } },
      select: { id: true },
    });
    await lockSerialNumbers(tx, serials.map((serial) => serial.id));

    const rows = await tx.branchInventory.findMany({
      where: {
        tenantId: input.tenantId,
        serialNumber: { serialNo: { in: serialNos } },
      },
      select: {
        id: true,
        serialNumberId: true,
        warehouseLocationId: true,
        branch: { select: { primaryWarehouseId: true, deletedAt: true } },
        statusCode: { select: { code: true } },
        serialNumber: { select: { serialNo: true, modelId: true, deletedAt: true } },
        warehouseLocation: { select: { code: true } },
      },
    });
    const bySerialNo = new Map(rows.map((row) => [row.serialNumber.serialNo, row]));

    const notHere: string[] = [];
    const wrongModel: string[] = [];
    const notOnShelf: string[] = [];
    const elsewhere: string[] = [];
    const toTag: typeof rows = [];
    let skipped = 0;
    for (const serialNo of serialNos) {
      const row = bySerialNo.get(serialNo);
      if (!row || row.branch.deletedAt || row.branch.primaryWarehouseId !== input.warehouseId) {
        notHere.push(serialNo);
      } else if (row.serialNumber.modelId !== input.modelId || row.serialNumber.deletedAt) {
        wrongModel.push(serialNo);
      } else if (!(SHELF_STATUS_CODES as readonly string[]).includes(row.statusCode.code)) {
        notOnShelf.push(serialNo);
      } else if (row.warehouseLocationId === input.locationId) {
        skipped += 1;
      } else if (row.warehouseLocationId) {
        elsewhere.push(`${serialNo} (${row.warehouseLocation?.code ?? "another location"})`);
      } else {
        toTag.push(row);
      }
    }

    if (notHere.length > 0) {
      throw new Error(
        `Not in the stock of a branch that uses ${location.warehouse.code}: ${listSome(notHere)}.`,
      );
    }
    if (wrongModel.length > 0) throw new Error(`Not this model: ${listSome(wrongModel)}.`);
    if (notOnShelf.length > 0) {
      throw new Error(`Not on the shelf (sold or in transit): ${listSome(notOnShelf)}.`);
    }
    if (elsewhere.length > 0) {
      throw new Error(
        `Already in another location: ${listSome(elsewhere)}. Use Edit location in Warehouse stock to move them.`,
      );
    }

    if (toTag.length > 0) {
      const updated = await tx.branchInventory.updateMany({
        where: { id: { in: toTag.map((row) => row.id) }, warehouseLocationId: null },
        data: { warehouseLocationId: input.locationId, updatedById: input.userId },
      });
      if (updated.count !== toTag.length) {
        throw new Error("Some serials were stocked in by someone else just now. Reload and try again.");
      }
      await tx.serialNumberHistory.createMany({
        data: toTag.map((row) => ({
          tenantId: input.tenantId,
          serialNumberId: row.serialNumberId,
          txnType: "inv_status_update" as const,
          details: `Stocked in to ${location.warehouse.code} / ${location.code}`,
          status: row.statusCode.code,
          createdById: input.userId,
        })),
      });
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: "warehouse.branch_stock_located",
          entityType: "WarehouseLocation",
          entityId: input.locationId,
          metadata: { warehouseCode: location.warehouse.code, locationCode: location.code, count: toTag.length },
        },
      });
    }

    const parts = [`Stocked ${toTag.length} serial${toTag.length === 1 ? "" : "s"} into ${location.code}.`];
    if (skipped > 0) parts.push(`${skipped} already there.`);
    return { tagged: toTag.length, skipped, message: parts.join(" ") };
  });
}

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
