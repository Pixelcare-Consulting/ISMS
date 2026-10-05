const tx = {
  notification: {
    create: jest.fn().mockResolvedValue({ id: "n-new" }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  sapChangeWatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
};

jest.mock("@/lib/database/client", () => ({
  prisma: {
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    notification: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
  },
}));

import { sapChangeWatchRepository } from "@/features/sap/repositories/sap-change-watch.repository";
import { prisma } from "@/lib/database/client";

const notification = {
  permissionKey: "warehouses.manage",
  type: "sap.changes.warehouse",
  title: "SAP has new data for Warehouses",
  body: "1 new in SAP.",
  href: "/settings/warehouses",
  metadata: {},
};

describe("sapChangeWatchRepository.publish", () => {
  it("creates a PERMISSION notification, closes the old one and points the watch at the new one", async () => {
    const id = await sapChangeWatchRepository.publish({
      tenantId: "t1",
      syncKey: "warehouse",
      fingerprint: "fp",
      previousNotificationId: "n-old",
      notification,
    });

    expect(id).toBe("n-new");
    expect(tx.notification.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "t1",
      audience: "PERMISSION",
      permissionKey: "warehouses.manage",
    });
    expect(tx.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "n-old", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    // Only moves the watch if it still points at the notification this check started from.
    expect(tx.sapChangeWatch.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", syncKey: "warehouse", notificationId: "n-old" },
      data: { fingerprint: "fp", notificationId: "n-new" },
    });
  });

  it("returns null and closes nothing when an overlapping check moved the watch first", async () => {
    tx.sapChangeWatch.updateMany.mockResolvedValueOnce({ count: 0 });

    const id = await sapChangeWatchRepository.publish({
      tenantId: "t1",
      syncKey: "warehouse",
      fingerprint: "fp",
      previousNotificationId: "n-old",
      notification,
    });

    // The thrown marker rolls the transaction back, so the created notification goes too.
    expect(id).toBeNull();
    expect(tx.notification.updateMany).not.toHaveBeenCalled();
  });

  it("closes nothing on the first notification", async () => {
    await sapChangeWatchRepository.publish({
      tenantId: "t1",
      syncKey: "warehouse",
      fingerprint: "fp",
      previousNotificationId: null,
      notification,
    });
    expect(tx.notification.updateMany).not.toHaveBeenCalled();
  });
});

describe("sapChangeWatchRepository.clear", () => {
  it("closes the notification and resets the watch", async () => {
    await expect(
      sapChangeWatchRepository.clear({ tenantId: "t1", syncKey: "warehouse", previousNotificationId: "n1" }),
    ).resolves.toBe(true);
    expect(tx.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "n1", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("returns false when an overlapping check moved the watch first", async () => {
    tx.sapChangeWatch.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      sapChangeWatchRepository.clear({ tenantId: "t1", syncKey: "warehouse", previousNotificationId: "n1" }),
    ).resolves.toBe(false);
    expect(tx.notification.updateMany).not.toHaveBeenCalled();
  });
});

describe("sapChangeWatchRepository.purgeClosedNotifications", () => {
  it("only deletes closed auto-check notifications", async () => {
    const before = new Date("2026-10-01T00:00:00Z");
    await expect(sapChangeWatchRepository.purgeClosedNotifications(before)).resolves.toBe(3);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { type: { startsWith: "sap.changes." }, deletedAt: { lt: before } },
    });
  });
});
