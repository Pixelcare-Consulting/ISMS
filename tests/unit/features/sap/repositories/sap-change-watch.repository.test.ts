const tx = {
  notification: {
    create: jest.fn().mockResolvedValue({ id: "n-new" }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  sapChangeWatch: { update: jest.fn().mockResolvedValue({}) },
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
    expect(tx.sapChangeWatch.update).toHaveBeenCalledWith({
      where: { tenantId_syncKey: { tenantId: "t1", syncKey: "warehouse" } },
      data: { fingerprint: "fp", notificationId: "n-new" },
    });
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

describe("sapChangeWatchRepository.purgeClosedNotifications", () => {
  it("only deletes closed auto-check notifications", async () => {
    const before = new Date("2026-10-01T00:00:00Z");
    await expect(sapChangeWatchRepository.purgeClosedNotifications(before)).resolves.toBe(3);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { type: { startsWith: "sap.changes." }, deletedAt: { lt: before } },
    });
  });
});
