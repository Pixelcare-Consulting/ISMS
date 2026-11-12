import { inventoryStatusSeenRepository } from "@/features/inventory/repositories/inventory-status-seen.repository";

export type InventoryUnreadCounts = {
  seenThroughAt: Date;
  total: number;
  byStatusCodeId: Record<string, number>;
  byCode: Record<string, number>;
  /** Unread units for one branch, then status code. */
  byBranchCode: Record<string, Record<string, number>>;
};

/**
 * Seen cursor and per-unit reads for Branch Inventory v2.
 * Pass the same branch ids the inventory list uses. An empty list counts as zero
 * and still records the cursor the first time.
 */
export const inventoryStatusSeenService = {
  ensureSeenThrough(userId: string) {
    return inventoryStatusSeenRepository.ensureSeenThrough(userId);
  },

  markRead(userId: string, branchInventoryId: string) {
    return inventoryStatusSeenRepository.markRead(userId, branchInventoryId);
  },

  async unreadCounts(input: {
    tenantId: string;
    userId: string;
    branchIds: string[];
  }): Promise<InventoryUnreadCounts> {
    const cursor = await inventoryStatusSeenRepository.ensureSeenThrough(input.userId);
    const rows = await inventoryStatusSeenRepository.countUnreadByStatus({
      tenantId: input.tenantId,
      userId: input.userId,
      branchIds: input.branchIds,
      seenThroughAt: cursor.seenThroughAt,
    });
    const byStatusCodeId: Record<string, number> = {};
    const byCode: Record<string, number> = {};
    const byBranchCode: Record<string, Record<string, number>> = {};
    let total = 0;
    for (const row of rows) {
      byStatusCodeId[row.statusCodeId] = (byStatusCodeId[row.statusCodeId] ?? 0) + row.count;
      byCode[row.code] = (byCode[row.code] ?? 0) + row.count;
      const branchCounts = byBranchCode[row.branchId] ?? {};
      branchCounts[row.code] = (branchCounts[row.code] ?? 0) + row.count;
      byBranchCode[row.branchId] = branchCounts;
      total += row.count;
    }
    return { seenThroughAt: cursor.seenThroughAt, total, byStatusCodeId, byCode, byBranchCode };
  },

  unreadIds(input: {
    tenantId: string;
    userId: string;
    seenThroughAt: Date;
    branchIds: string[];
    branchInventoryIds: string[];
  }) {
    return inventoryStatusSeenRepository.unreadIds(input);
  },
};
