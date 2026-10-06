import { prisma } from "@/lib/database/client";
import { SAP_SYNC_CHUNK, SAP_SYNC_WRITE_CONCURRENCY } from "@/features/sap/services/sap-master-data";
import { STOCK_UNITS_LIST_STATUS_CODES } from "@/features/inventory/repositories/inventory.repository";

/**
 * Persistence for placing SAP's on-hand serials: Stock units (`branch_inventories`),
 * Warehouse stock (`warehouse_inventories`) and the planogram quantity (`maxQty`). See
 * `sap-stock-placement.service.ts` for the rules.
 */

export interface SapStockSite {
  id: string;
  code: string;
  name: string;
}

export interface IsmsSerial {
  id: string;
  modelId: string;
  deletedAt: Date | null;
}

/** Bulk lookups go in chunks this size — one statement each, well under Postgres' limits. */
const LOOKUP_CHUNK = 5000;

/**
 * What ISMS writes in `warehouse_inventories.system_status` for a unit SAP holds on hand.
 * `system_updated_at` is the placement pass that last confirmed it.
 */
export const SAP_ON_HAND_SYSTEM_STATUS = "On hand (SAP)";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function inParallel<T>(items: T[], run: (item: T) => Promise<unknown>): Promise<void> {
  for (const batch of chunk(items, SAP_SYNC_WRITE_CONCURRENCY)) {
    await Promise.all(batch.map(run));
  }
}

export const sapStockPlacementRepository = {
  /** Live branches carrying a SAP warehouse code. */
  async listSapBranches(tenantId: string): Promise<SapStockSite[]> {
    const branches = await prisma.branch.findMany({
      where: { tenantId, deletedAt: null, sapCode: { not: "" } },
      select: { id: true, sapCode: true, name: true },
      orderBy: { sapCode: "asc" },
    });
    return branches.map((branch) => ({ id: branch.id, code: branch.sapCode, name: branch.name }));
  },

  /**
   * Live warehouses the SAP warehouse sync created. Hand-made warehouses (e.g. seeded test
   * ones) are not SAP's to fill, so they are never read or reconciled.
   */
  listSapWarehouses(tenantId: string): Promise<SapStockSite[]> {
    return prisma.warehouse.findMany({
      where: { tenantId, deletedAt: null, sapSyncedAt: { not: null }, code: { not: "" } },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });
  },

  /**
   * The ISMS location that stands for the SAP warehouse itself — SAP has no position
   * inside a warehouse here, so its serials are filed under one location per warehouse,
   * coded and named after it. Created on first use; renamed if SAP renamed the warehouse.
   */
  async ensureWarehouseLocation(warehouse: SapStockSite): Promise<string> {
    const location = await prisma.warehouseLocation.upsert({
      where: { warehouseId_code: { warehouseId: warehouse.id, code: warehouse.code } },
      create: { warehouseId: warehouse.id, code: warehouse.code, name: warehouse.name },
      update: { name: warehouse.name },
      select: { id: true },
    });
    return location.id;
  },

  /** Model id per SAP item code. Includes retired models so their stock still lands. */
  async modelIdBySku(tenantId: string): Promise<Map<string, string>> {
    const models = await prisma.productModel.findMany({
      where: { tenantId },
      select: { id: true, skuCode: true },
    });
    return new Map(models.map((model) => [model.skuCode, model.id]));
  },

  async findSerials(tenantId: string, serialNos: string[]): Promise<Map<string, IsmsSerial>> {
    const found = new Map<string, IsmsSerial>();
    for (const batch of chunk(serialNos, LOOKUP_CHUNK)) {
      const rows = await prisma.serialNumber.findMany({
        where: { tenantId, serialNo: { in: batch } },
        select: { id: true, serialNo: true, modelId: true, deletedAt: true },
      });
      for (const row of rows) found.set(row.serialNo, row);
    }
    return found;
  },

  // ── Stock units (branches) ────────────────────────────────────────────────────────

  async findBranchUnits(
    tenantId: string,
    serialNumberIds: string[],
  ): Promise<{ id: string; branchId: string; serialNumberId: string }[]> {
    const rows: { id: string; branchId: string; serialNumberId: string }[] = [];
    for (const batch of chunk(serialNumberIds, LOOKUP_CHUNK)) {
      rows.push(
        ...(await prisma.branchInventory.findMany({
          where: { tenantId, serialNumberId: { in: batch } },
          select: { id: true, branchId: true, serialNumberId: true },
        })),
      );
    }
    return rows;
  },

  async createBranchUnits(
    tenantId: string,
    rows: { branchId: string; serialNumberId: string }[],
    statusCodeId: string,
    updatedById: string | null,
  ): Promise<number> {
    let created = 0;
    for (const batch of chunk(rows, SAP_SYNC_CHUNK)) {
      const result = await prisma.branchInventory.createMany({
        data: batch.map((row) => ({ tenantId, statusCodeId, updatedById, ...row })),
        skipDuplicates: true,
      });
      created += result.count;
    }
    return created;
  },

  /** Move units SAP now holds at another branch; they are on hand there, so back to STK. */
  moveBranchUnits(
    tenantId: string,
    moves: { id: string; branchId: string }[],
    statusCodeId: string,
    updatedById: string | null,
  ): Promise<void> {
    return inParallel(moves, (move) =>
      prisma.branchInventory.update({
        where: { id: move.id, tenantId },
        data: { branchId: move.branchId, statusCodeId, updatedById },
      }),
    );
  },

  /** Serial numbers of the on-hand (STK) Stock units at one branch. */
  async listBranchOnHandSerialNos(tenantId: string, branchId: string): Promise<string[]> {
    const rows = await prisma.branchInventory.findMany({
      where: {
        tenantId,
        branchId,
        statusCode: { code: { in: [...STOCK_UNITS_LIST_STATUS_CODES] } },
      },
      select: { serialNumber: { select: { serialNo: true } } },
    });
    return rows.map((row) => row.serialNumber.serialNo);
  },

  // ── Warehouse stock ───────────────────────────────────────────────────────────────

  async findWarehouseUnits(
    tenantId: string,
    serialNumberIds: string[],
  ): Promise<{ id: string; serialNumberId: string; warehouseId: string }[]> {
    const rows: { id: string; serialNumberId: string; warehouseId: string }[] = [];
    for (const batch of chunk(serialNumberIds, LOOKUP_CHUNK)) {
      const found = await prisma.warehouseInventory.findMany({
        where: { tenantId, serialNumberId: { in: batch } },
        select: {
          id: true,
          serialNumberId: true,
          warehouseLocation: { select: { warehouseId: true } },
        },
      });
      rows.push(
        ...found.map((row) => ({
          id: row.id,
          serialNumberId: row.serialNumberId,
          warehouseId: row.warehouseLocation.warehouseId,
        })),
      );
    }
    return rows;
  },

  async createWarehouseUnits(
    tenantId: string,
    warehouseLocationId: string,
    serialNumberIds: string[],
    seenAt: Date,
  ): Promise<number> {
    let created = 0;
    for (const batch of chunk(serialNumberIds, SAP_SYNC_CHUNK)) {
      const result = await prisma.warehouseInventory.createMany({
        data: batch.map((serialNumberId) => ({
          tenantId,
          serialNumberId,
          warehouseLocationId,
          systemStatus: SAP_ON_HAND_SYSTEM_STATUS,
          systemUpdatedAt: seenAt,
        })),
        skipDuplicates: true,
      });
      created += result.count;
    }
    return created;
  },

  /** Move units SAP now holds in another warehouse into that warehouse's SAP location. */
  moveWarehouseUnits(
    tenantId: string,
    ids: string[],
    warehouseLocationId: string,
    seenAt: Date,
  ): Promise<void> {
    return inParallel(ids, (id) =>
      prisma.warehouseInventory.update({
        where: { id, tenantId },
        data: {
          warehouseLocationId,
          systemStatus: SAP_ON_HAND_SYSTEM_STATUS,
          systemUpdatedAt: seenAt,
        },
      }),
    );
  },

  /** Record that SAP still holds these units, without touching anything else about them. */
  async stampWarehouseUnits(tenantId: string, ids: string[], seenAt: Date): Promise<void> {
    for (const batch of chunk(ids, LOOKUP_CHUNK)) {
      await prisma.warehouseInventory.updateMany({
        where: { tenantId, id: { in: batch } },
        data: { systemStatus: SAP_ON_HAND_SYSTEM_STATUS, systemUpdatedAt: seenAt },
      });
    }
  },

  /** Units in this warehouse that the placement pass started at `passMark` never saw. */
  countWarehouseUnitsUnseen(tenantId: string, warehouseId: string, passMark: Date) {
    return prisma.warehouseInventory.count({
      where: {
        tenantId,
        warehouseLocation: { warehouseId },
        OR: [{ systemUpdatedAt: null }, { systemUpdatedAt: { lt: passMark } }],
      },
    });
  },

  // ── Planogram quantity ────────────────────────────────────────────────────────────

  listPlanogramQty(
    tenantId: string,
    branchId: string,
  ): Promise<{ id: string; modelId: string; maxQty: number }[]> {
    return prisma.branchPlanogram.findMany({
      where: { tenantId, branchId },
      select: { id: true, modelId: true, maxQty: true },
    });
  },

  setPlanogramQty(tenantId: string, updates: { id: string; maxQty: number }[]): Promise<void> {
    return inParallel(updates, (update) =>
      prisma.branchPlanogram.update({
        where: { id: update.id, tenantId },
        data: { maxQty: update.maxQty },
      }),
    );
  },
};
