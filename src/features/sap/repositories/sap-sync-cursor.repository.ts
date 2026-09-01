import { prisma } from "@/lib/database/client";

/**
 * Read/write where each SAP sync has got to. See `SapSyncCursor` in the schema for what a
 * pass is and why every entity — two rows or four million — uses one.
 */
export const sapSyncCursorRepository = {
  /** The cursor for this entity, created idle the first time it is asked for. */
  async get(tenantId: string, entity: string) {
    return prisma.sapSyncCursor.upsert({
      where: { tenantId_entity: { tenantId, entity } },
      create: { tenantId, entity },
      update: {},
    });
  },

  /**
   * Start a pass at the beginning of the entity.
   *
   * `totalAtSource` is measured by the caller as part of starting, so the denominator
   * always describes the pass being reported on rather than a previous one.
   */
  async beginPass(tenantId: string, entity: string, totalAtSource: number | null) {
    return prisma.sapSyncCursor.update({
      where: { tenantId_entity: { tenantId, entity } },
      data: {
        lastKey: null,
        passRows: 0,
        passStartedAt: new Date(),
        totalAtSource,
        lastRunAt: new Date(),
        lastError: null,
      },
    });
  },

  /**
   * Record a page as applied, so the next run resumes after it.
   *
   * Unguarded: `withSapSyncLock` keeps runs from overlapping within a process, but two
   * instances (a cron slice and a button press on different servers) still could. The
   * worst that costs is re-reading pages, never wrong data — every write here is an
   * upsert keyed on the record's SAP code, and a pass re-reads the whole entity anyway.
   * A comparison guard is not available regardless: the key is text, so "100" would sort
   * below "99".
   */
  async advance(tenantId: string, entity: string, lastKey: string, passRows: number) {
    await prisma.sapSyncCursor.update({
      where: { tenantId_entity: { tenantId, entity } },
      data: { lastKey, passRows, lastRunAt: new Date(), lastError: null },
    });
  },

  /**
   * Record that a pass reached the end of the entity.
   *
   * Clearing `passStartedAt` is what arms the next pass: the following run finds no pass
   * in progress and begins a fresh one from the start of the entity. That is how edits
   * made in SAP are picked up — `passRows` and `lastKey` are kept only so the run that
   * just finished can report what it did.
   */
  async completePass(tenantId: string, entity: string) {
    await prisma.sapSyncCursor.update({
      where: { tenantId_entity: { tenantId, entity } },
      data: {
        passStartedAt: null,
        lastCompletedAt: new Date(),
        lastRunAt: new Date(),
        lastError: null,
      },
    });
  },

  /**
   * Record why a run failed, leaving its position intact so the pass resumes rather than
   * restarting. `updateMany` so a failure that happened before the cursor existed is a
   * no-op — a bookkeeping write must never replace the real error with one of its own.
   */
  async recordError(tenantId: string, entity: string, message: string) {
    await prisma.sapSyncCursor.updateMany({
      where: { tenantId, entity },
      // Truncated: this is shown in a UI, and SAP errors can carry a whole stack.
      data: { lastError: message.slice(0, 500), lastRunAt: new Date() },
    });
  },

  /** Abandon any pass in progress and read the entity from the start next run. */
  async reset(tenantId: string, entity: string) {
    await prisma.sapSyncCursor.updateMany({
      where: { tenantId, entity },
      data: {
        lastKey: null,
        passRows: 0,
        passStartedAt: null,
        totalAtSource: null,
        lastError: null,
      },
    });
  },
};
