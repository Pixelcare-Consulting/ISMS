import type { Prisma } from "@/lib/database/generated/prisma/client";

type WarehousePlacementWriter = {
  warehouseInventory: Prisma.TransactionClient["warehouseInventory"];
};

/**
 * Warehouse placement writer.
 *
 * Serial master sync stays registry-only and must not call this. Stock is placed
 * only by an explicit location stock-in, or by a warehouse receive (live SAP test
 * company, or the labeled local fixture). Approving an order, syncing warehouses
 * from SAP, and creating a model, warehouse, or location do not call this.
 *
 * Callers lock the serial and refuse any other current placement first.
 * A short insert count is a failure, not a silent skip.
 */

/** Status shown on warehouse stock after a person stocks a serial into a location. */
export const STOCK_IN_SYSTEM_STATUS = "Stock";

/** Rows written per statement. Stays well under Postgres parameter limits. */
const WRITE_CHUNK = 500;

export const SAP_ON_HAND_SYSTEM_STATUS = "On hand (SAP)";
export const LOCAL_FIXTURE_SYSTEM_STATUS = "On hand (local-sap-fixture)";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const sapStockPlacementRepository = {
  /**
   * Insert warehouse units that the caller has already proved are unoccupied.
   * A duplicate is an error so a mixed batch can roll back.
   */
  async createWarehouseUnits(
    tx: WarehousePlacementWriter,
    tenantId: string,
    warehouseLocationId: string,
    serialNumberIds: string[],
    seenAt: Date,
    systemStatus: string,
  ): Promise<number> {
    let created = 0;
    for (const batch of chunk(serialNumberIds, WRITE_CHUNK)) {
      const result = await tx.warehouseInventory.createMany({
        data: batch.map((serialNumberId) => ({
          tenantId,
          serialNumberId,
          warehouseLocationId,
          systemStatus,
          systemUpdatedAt: seenAt,
        })),
      });
      if (result.count !== batch.length) {
        throw new Error("Warehouse stock-in did not place every serial.");
      }
      created += result.count;
    }
    return created;
  },
};
