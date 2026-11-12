import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";

export type UnreadStatusCount = {
  branchId: string;
  statusCodeId: string;
  code: string;
  count: number;
};

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export const inventoryStatusSeenRepository = {
  /**
   * First count for this user freezes seenThroughAt at now().
   * Later counts keep that instant.
   * The page and the sidebar both call this on first open, so a lost insert
   * reads the row the other request already created.
   */
  async ensureSeenThrough(userId: string, at: Date = new Date()) {
    try {
      return await prisma.branchInventorySeenCursor.upsert({
        where: { userId },
        create: { userId, seenThroughAt: at },
        update: {},
      });
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const existing = await prisma.branchInventorySeenCursor.findUnique({
        where: { userId },
      });
      if (!existing) throw error;
      return existing;
    }
  },

  markRead(userId: string, branchInventoryId: string, at: Date = new Date()) {
    return prisma.branchInventoryRead.upsert({
      where: { userId_branchInventoryId: { userId, branchInventoryId } },
      create: { userId, branchInventoryId, readAt: at },
      update: { readAt: at },
    });
  },

  async countUnreadByStatus(input: {
    tenantId: string;
    userId: string;
    branchIds: string[];
    seenThroughAt: Date;
  }): Promise<UnreadStatusCount[]> {
    if (input.branchIds.length === 0) return [];
    const rows = await prisma.$queryRaw<UnreadStatusCount[]>`
      SELECT bi.branch_id AS "branchId",
             bi.status_code_id AS "statusCodeId",
             c.code AS "code",
             COUNT(*)::int AS count
      FROM branch_inventories bi
      INNER JOIN reason_status_codes c ON c.id = bi.status_code_id
      LEFT JOIN branch_inventory_reads r
        ON r.branch_inventory_id = bi.id
       AND r.user_id = ${input.userId}
      WHERE bi.tenant_id = ${input.tenantId}
        AND bi.branch_id IN (${Prisma.join(input.branchIds)})
        AND bi.status_updated_at IS NOT NULL
        AND bi.status_updated_at > COALESCE(r.read_at, ${input.seenThroughAt})
      GROUP BY bi.branch_id, bi.status_code_id, c.code
    `;
    return rows;
  },

  async unreadIds(input: {
    tenantId: string;
    userId: string;
    seenThroughAt: Date;
    branchIds: string[];
    branchInventoryIds: string[];
  }): Promise<string[]> {
    if (input.branchInventoryIds.length === 0 || input.branchIds.length === 0) return [];
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT bi.id
      FROM branch_inventories bi
      LEFT JOIN branch_inventory_reads r
        ON r.branch_inventory_id = bi.id
       AND r.user_id = ${input.userId}
      WHERE bi.tenant_id = ${input.tenantId}
        AND bi.id IN (${Prisma.join(input.branchInventoryIds)})
        AND bi.branch_id IN (${Prisma.join(input.branchIds)})
        AND bi.status_updated_at IS NOT NULL
        AND bi.status_updated_at > COALESCE(r.read_at, ${input.seenThroughAt})
    `;
    return rows.map((row) => row.id);
  },
};
