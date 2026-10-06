import { prisma } from "@/lib/database/client";
import { SAP_SYNC_CHUNK, SAP_SYNC_WRITE_CONCURRENCY } from "@/features/sap/services/sap-master-data";
import { STOCK_UNITS_LIST_STATUS_CODES } from "@/features/inventory/repositories/inventory.repository";

/**
 * Persistence for SAP branch stock: the planogram's read-only on-hand
 * (`branch_stock_levels`) and the Stock units the serial sync places
 * (`branch_inventories`). See `sap-branch-stock.service.ts` for the rules.
 */

export interface SapStockBranch {
  id: string;
  sapCode: string;
}

export interface StockLevelRow {
  modelId: string;
  onHandQty: number;
}

export interface StockUnitCreate {
  branchId: string;
  serialNumberId: string;
}

export interface StockUnitMove {
  id: string;
  branchId: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const sapBranchStockRepository = {
  /** Live branches that carry a SAP warehouse code — the only ones SAP can hold stock for. */
  listSapBranches(tenantId: string): Promise<SapStockBranch[]> {
    return prisma.branch.findMany({
      where: { tenantId, deletedAt: null, sapCode: { not: "" } },
      select: { id: true, sapCode: true },
      orderBy: { sapCode: "asc" },
    });
  },

  /** Model id per SAP item code. Includes retired models so their stock still lands. */
  async modelIdBySku(tenantId: string): Promise<Map<string, string>> {
    const models = await prisma.productModel.findMany({
      where: { tenantId },
      select: { id: true, skuCode: true },
    });
    return new Map(models.map((model) => [model.skuCode, model.id]));
  },

  /** Replace one branch's on-hand levels with what SAP holds now. */
  async replaceStockLevels(
    tenantId: string,
    branchId: string,
    rows: StockLevelRow[],
    syncedAt: Date,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.branchStockLevel.deleteMany({ where: { tenantId, branchId } }),
      prisma.branchStockLevel.createMany({
        data: rows.map((row) => ({ tenantId, branchId, syncedAt, ...row })),
      }),
    ]);
  },

  /** On-hand per model at one branch, for the planogram. */
  async stockLevelsForBranch(tenantId: string, branchId: string): Promise<Map<string, number>> {
    const rows = await prisma.branchStockLevel.findMany({
      where: { tenantId, branchId },
      select: { modelId: true, onHandQty: true },
    });
    return new Map(rows.map((row) => [row.modelId, row.onHandQty]));
  },

  /** When this branch's on-hand was last read from SAP, or null if it never was. */
  async stockLevelsSyncedAt(tenantId: string, branchId: string): Promise<Date | null> {
    const row = await prisma.branchStockLevel.findFirst({
      where: { tenantId, branchId },
      select: { syncedAt: true },
      orderBy: { syncedAt: "desc" },
    });
    return row?.syncedAt ?? null;
  },

  /** ISMS serials by serial number, read in bounded chunks. */
  async findSerials(
    tenantId: string,
    serialNos: string[],
  ): Promise<Map<string, { id: string; modelId: string; deletedAt: Date | null }>> {
    const found = new Map<string, { id: string; modelId: string; deletedAt: Date | null }>();
    for (const batch of chunk(serialNos, SAP_SYNC_CHUNK)) {
      const rows = await prisma.serialNumber.findMany({
        where: { tenantId, serialNo: { in: batch } },
        select: { id: true, serialNo: true, modelId: true, deletedAt: true },
      });
      for (const row of rows) found.set(row.serialNo, row);
    }
    return found;
  },

  /** Existing Stock units for these serials, at any branch. */
  async findStockUnits(
    tenantId: string,
    serialNumberIds: string[],
  ): Promise<{ id: string; branchId: string; serialNumberId: string }[]> {
    const rows: { id: string; branchId: string; serialNumberId: string }[] = [];
    for (const batch of chunk(serialNumberIds, SAP_SYNC_CHUNK)) {
      rows.push(
        ...(await prisma.branchInventory.findMany({
          where: { tenantId, serialNumberId: { in: batch } },
          select: { id: true, branchId: true, serialNumberId: true },
        })),
      );
    }
    return rows;
  },

  async createStockUnits(
    tenantId: string,
    rows: StockUnitCreate[],
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
  async moveStockUnits(
    tenantId: string,
    moves: StockUnitMove[],
    statusCodeId: string,
    updatedById: string | null,
  ): Promise<void> {
    for (const batch of chunk(moves, SAP_SYNC_WRITE_CONCURRENCY)) {
      await Promise.all(
        batch.map((move) =>
          prisma.branchInventory.update({
            where: { id: move.id, tenantId },
            data: { branchId: move.branchId, statusCodeId, updatedById },
          }),
        ),
      );
    }
  },

  /** On-hand (STK) Stock units at these branches, as `branchId` + serial number. */
  listOnHandStockUnits(
    tenantId: string,
    branchIds: string[],
  ): Promise<{ branchId: string; serialNumber: { serialNo: string } }[]> {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.branchInventory.findMany({
      where: {
        tenantId,
        branchId: { in: branchIds },
        statusCode: { code: { in: [...STOCK_UNITS_LIST_STATUS_CODES] } },
      },
      select: { branchId: true, serialNumber: { select: { serialNo: true } } },
    });
  },
};
