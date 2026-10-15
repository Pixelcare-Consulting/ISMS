import { SAP_SYNC_CHUNK } from "@/features/sap/services/sap-master-data";
import { prisma } from "@/lib/database/client";

/**
 * Read-only ISMS lookups for the SAP auto-check. Nothing here writes: the check compares
 * SAP against these rows and only ever writes its own watch rows and notifications
 * (`sap-change-watch.repository.ts`).
 *
 * The three location tables are small (hundreds to low thousands per tenant), so they are
 * read whole — soft-deleted rows included, since a SAP row can match one and restore it.
 * Models and serials are only ever looked up by the keys a check names.
 */

/** Run a `key in [...]` lookup in bounded chunks. */
async function inChunks<T>(keys: string[], read: (chunk: string[]) => Promise<T[]>) {
  const unique = [...new Set(keys)];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += SAP_SYNC_CHUNK) {
    out.push(...(await read(unique.slice(i, i + SAP_SYNC_CHUNK))));
  }
  return out;
}

export const sapChangeCheckRepository = {
  /** Every sync cursor for the tenant — to skip a module whose sync is mid-pass. */
  listSyncCursors(tenantId: string) {
    return prisma.sapSyncCursor.findMany({
      where: { tenantId },
      select: { entity: true, passStartedAt: true, lastRunAt: true, lastCompletedAt: true },
    });
  },

  listWarehouses(tenantId: string) {
    return prisma.warehouse.findMany({
      where: { tenantId },
      select: { code: true, name: true, deletedAt: true },
    });
  },

  listBranches(tenantId: string) {
    return prisma.branch.findMany({
      where: { tenantId },
      select: { sapCode: true, name: true, deletedAt: true, sapSyncSource: true },
    });
  },

  listServiceCenters(tenantId: string) {
    return prisma.serviceCenter.findMany({
      where: { tenantId },
      select: { sapCode: true, name: true, deletedAt: true },
    });
  },

  findModels(tenantId: string, skuCodes: string[]) {
    return inChunks(skuCodes, (chunk) =>
      prisma.productModel.findMany({
        where: { tenantId, skuCode: { in: chunk } },
        select: {
          skuCode: true,
          name: true,
          description: true,
          status: true,
          brandId: true,
          deletedAt: true,
        },
      }),
    );
  },

  listBrands(tenantId: string) {
    return prisma.brand.findMany({ where: { tenantId }, select: { id: true, name: true } });
  },

  /**
   * Every model SKU the tenant has stored, including ones removed from Master data.
   * The serial sync walks only models still in Master data; this check stays wider.
   */
  async listModelSkus(tenantId: string) {
    const rows = await prisma.productModel.findMany({
      where: { tenantId },
      select: { skuCode: true },
    });
    return new Set(rows.map((row) => row.skuCode));
  },

  /** Which of these serials ISMS already holds live. */
  async findLiveSerials(tenantId: string, serialNos: string[]) {
    const rows = await inChunks(serialNos, (chunk) =>
      prisma.serialNumber.findMany({
        where: { tenantId, serialNo: { in: chunk }, deletedAt: null },
        select: { serialNo: true },
      }),
    );
    return new Set(rows.map((row) => row.serialNo));
  },
};
