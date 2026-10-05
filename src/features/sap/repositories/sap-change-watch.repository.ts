import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";

/** Every notification the SAP auto-check raises has a type under this prefix. */
export const SAP_CHANGE_NOTIFICATION_PREFIX = "sap.changes.";

export type SapChangeNotificationData = {
  permissionKey: string;
  type: string;
  title: string;
  body: string;
  href: string;
  metadata: Prisma.InputJsonValue;
};

/**
 * Read/write what the SAP auto-check last told users about each sync. See `SapChangeWatch`
 * in the schema. The check's only writes are here: this row and the notification it points
 * at — never master data.
 */
export const sapChangeWatchRepository = {
  /** The watch for this sync, created empty the first time it is asked for. */
  async get(tenantId: string, syncKey: string) {
    return prisma.sapChangeWatch.upsert({
      where: { tenantId_syncKey: { tenantId, syncKey } },
      create: { tenantId, syncKey },
      update: {},
    });
  },

  /** Whether the notification is still showing (exists and not soft-deleted). */
  async isNotificationLive(notificationId: string) {
    const row = await prisma.notification.findFirst({
      where: { id: notificationId, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  },

  /**
   * Record a finished check. `highKey`/`pendingKeys` are only passed by the serial-number
   * check; `undefined` leaves them as they are.
   */
  async recordCheck(
    tenantId: string,
    syncKey: string,
    state?: { highKey?: string; pendingKeys?: string[] },
  ) {
    await prisma.sapChangeWatch.update({
      where: { tenantId_syncKey: { tenantId, syncKey } },
      data: {
        checkedAt: new Date(),
        lastError: null,
        highKey: state?.highKey,
        pendingKeys: state?.pendingKeys,
      },
    });
  },

  /**
   * Record why a check failed. `updateMany` so a failure before the row existed is a
   * no-op — a bookkeeping write must never replace the real error with one of its own.
   */
  async recordError(tenantId: string, syncKey: string, message: string) {
    await prisma.sapChangeWatch.updateMany({
      where: { tenantId, syncKey },
      // Truncated: SAP errors can carry a whole stack.
      data: { lastError: message.slice(0, 500), checkedAt: new Date() },
    });
  },

  /**
   * Replace the open notification with a new one, in one transaction: create the new one,
   * point the watch at it, and close the old one. Done together so a crash can never leave
   * a notification no watch points at — nothing would ever close it.
   */
  async publish(input: {
    tenantId: string;
    syncKey: string;
    fingerprint: string;
    previousNotificationId: string | null;
    notification: SapChangeNotificationData;
  }) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: {
          tenantId: input.tenantId,
          audience: "PERMISSION",
          permissionKey: input.notification.permissionKey,
          type: input.notification.type,
          title: input.notification.title,
          body: input.notification.body,
          href: input.notification.href,
          metadata: input.notification.metadata,
        },
        select: { id: true },
      });

      if (input.previousNotificationId) {
        await tx.notification.updateMany({
          where: { id: input.previousNotificationId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      }

      await tx.sapChangeWatch.update({
        where: { tenantId_syncKey: { tenantId: input.tenantId, syncKey: input.syncKey } },
        data: { fingerprint: input.fingerprint, notificationId: created.id },
      });

      return created.id;
    });
  },

  /** Close the open notification (SAP and ISMS agree again) and forget what it said. */
  async clear(input: {
    tenantId: string;
    syncKey: string;
    previousNotificationId: string | null;
  }) {
    await prisma.$transaction(async (tx) => {
      if (input.previousNotificationId) {
        await tx.notification.updateMany({
          where: { id: input.previousNotificationId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      }
      await tx.sapChangeWatch.update({
        where: { tenantId_syncKey: { tenantId: input.tenantId, syncKey: input.syncKey } },
        data: { fingerprint: null, notificationId: null },
      });
    });
  },

  /**
   * Hard-delete auto-check notifications closed before `before`. Their per-user
   * `NotificationState` rows cascade. Only closed ones: an open notification is still news.
   */
  async purgeClosedNotifications(before: Date) {
    const result = await prisma.notification.deleteMany({
      where: {
        type: { startsWith: SAP_CHANGE_NOTIFICATION_PREFIX },
        deletedAt: { lt: before },
      },
    });
    return result.count;
  },
};
