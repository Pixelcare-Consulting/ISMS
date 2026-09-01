import { prisma } from "@/lib/database/client";

/**
 * Read/write the watermark a resumable SAP sync reads from. See `SapSyncCursor` in the
 * schema for why the watermark exists and what it is safe for.
 */
export const sapSyncCursorRepository = {
  /** The cursor for this entity, created at key 0 the first time it is asked for. */
  async get(tenantId: string, entity: string) {
    return prisma.sapSyncCursor.upsert({
      where: { tenantId_entity: { tenantId, entity } },
      create: { tenantId, entity },
      update: {},
    });
  },

  /**
   * Move the watermark forward. Guarded so a slow run that finishes after a newer one
   * cannot rewind the cursor and re-read rows already applied.
   */
  async advance(tenantId: string, entity: string, lastKey: number) {
    await prisma.sapSyncCursor.updateMany({
      where: { tenantId, entity, lastKey: { lt: lastKey } },
      data: { lastKey, lastRunAt: new Date(), caughtUpAt: null, lastError: null },
    });
  },

  /**
   * Note that a row was skipped for want of its parent, keeping the lowest such key.
   * `parentCount` is how many parents ISMS held at the time, which is what later decides
   * whether re-reading could produce a different answer.
   */
  async recordPending(
    tenantId: string,
    entity: string,
    fromKey: number,
    parentCount: number,
  ) {
    await prisma.sapSyncCursor.updateMany({
      where: {
        tenantId,
        entity,
        OR: [{ pendingFromKey: null }, { pendingFromKey: { gt: fromKey } }],
      },
      data: { pendingFromKey: fromKey, pendingParentCount: parentCount },
    });
  },

  /**
   * Record that the read reached the end of the entity.
   *
   * If rows were skipped for missing parents and ISMS has gained parents since, the
   * cursor rewinds to the lowest of them for one more pass instead of settling — that
   * second pass is what links serials whose model only arrived later. When the parent
   * count has not moved, re-reading could only produce the same skips, so it settles.
   *
   * Returns whether it rewound, so the caller can report "more to do".
   */
  async markCaughtUp(tenantId: string, entity: string, parentCount: number) {
    const cursor = await prisma.sapSyncCursor.findUnique({
      where: { tenantId_entity: { tenantId, entity } },
      select: { pendingFromKey: true, pendingParentCount: true },
    });

    const shouldRewind =
      cursor?.pendingFromKey != null &&
      parentCount > (cursor.pendingParentCount ?? 0);

    if (shouldRewind) {
      await prisma.sapSyncCursor.update({
        where: { tenantId_entity: { tenantId, entity } },
        data: {
          // `- 1` so the pending row itself is included by the `gt` filter next run.
          lastKey: Math.max(cursor.pendingFromKey! - 1, 0),
          pendingFromKey: null,
          pendingParentCount: null,
          caughtUpAt: null,
          lastRunAt: new Date(),
          lastError: null,
        },
      });
      return { rewound: true };
    }

    await prisma.sapSyncCursor.update({
      where: { tenantId_entity: { tenantId, entity } },
      data: { caughtUpAt: new Date(), lastRunAt: new Date(), lastError: null },
    });
    return { rewound: false };
  },

  /**
   * Record why a run failed. `updateMany` so a failure that happened before the cursor
   * was created is a no-op — a bookkeeping write must never replace the real error with
   * one of its own.
   */
  async recordError(tenantId: string, entity: string, message: string) {
    await prisma.sapSyncCursor.updateMany({
      where: { tenantId, entity },
      // Truncated: this is shown in a UI, and SAP errors can carry a whole stack.
      data: { lastError: message.slice(0, 500), lastRunAt: new Date() },
    });
  },

  async setTotalAtSource(tenantId: string, entity: string, totalAtSource: number) {
    await prisma.sapSyncCursor.update({
      where: { tenantId_entity: { tenantId, entity } },
      data: { totalAtSource },
    });
  },

  /** Restart the entity from scratch — used when the company database changes. */
  async reset(tenantId: string, entity: string) {
    await prisma.sapSyncCursor.updateMany({
      where: { tenantId, entity },
      data: {
        lastKey: 0,
        caughtUpAt: null,
        totalAtSource: null,
        lastError: null,
        pendingFromKey: null,
        pendingParentCount: null,
      },
    });
  },
};
