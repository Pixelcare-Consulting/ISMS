jest.mock("@/features/logistics/constants/logistics-permissions", () => ({
  LOGISTICS_DELIVERY_DISPATCH: "logistics.delivery.dispatch",
}));
jest.mock("@/lib/database/client", () => ({ prisma: { deliverySapDocument: { findMany: jest.fn() } } }));
jest.mock("@/features/sap/repositories/sap-change-watch.repository", () => ({
  SAP_CHANGE_NOTIFICATION_PREFIX: "sap.changes.",
  sapChangeWatchRepository: {
    get: jest.fn(),
    clear: jest.fn(),
    publish: jest.fn(),
    isNotificationLive: jest.fn(),
  },
}));

import {
  attentionFingerprint,
  describeAttention,
  notifyCopyToAttention,
  type AttentionDocument,
} from "@/features/logistics/services/sap-copy-to-follow.notifier";
import { sapChangeWatchRepository } from "@/features/sap/repositories/sap-change-watch.repository";
import { prisma } from "@/lib/database/client";

const findMany = prisma.deliverySapDocument.findMany as jest.Mock;
const watch = sapChangeWatchRepository as unknown as Record<string, jest.Mock>;

const doc = (over: Partial<AttentionDocument> = {}): AttentionDocument => ({
  docKind: "IT",
  docEntry: 491349,
  displayNo: "494398",
  status: "FAILED",
  error: "55QUHW01L082500150 is at branch ABENSON LCC IRIGA (DIT) in ISMS",
  deliveryId: "del1",
  deliveryNo: "DLV-MVQFXK53",
  ...over,
});

const row = (d: AttentionDocument) => ({
  docKind: d.docKind,
  docEntry: d.docEntry,
  displayNo: d.displayNo,
  status: d.status,
  error: d.error,
  delivery: { id: d.deliveryId, deliveryNo: d.deliveryNo },
});

beforeEach(() => {
  jest.clearAllMocks();
  watch.get.mockResolvedValue({ fingerprint: null, notificationId: null });
  watch.publish.mockResolvedValue("n1");
  watch.clear.mockResolvedValue(true);
});

describe("describeAttention", () => {
  it("names one document and links straight to its delivery", () => {
    expect(describeAttention([doc()])).toEqual({
      title: "SAP IT 494398 could not be added to a delivery",
      body: "IT 494398 (DLV-MVQFXK53): 55QUHW01L082500150 is at branch ABENSON LCC IRIGA (DIT) in ISMS",
      href: "/logistics/deliveries/del1",
    });
  });

  it("summarises several and links to the deliveries list", () => {
    const docs = [1, 2, 3, 4].map((n) => doc({ docEntry: n, displayNo: String(n), deliveryId: `d${n}` }));
    const described = describeAttention(docs);
    expect(described.title).toBe("4 SAP documents could not be added to deliveries");
    expect(described.body.endsWith("and 1 more.")).toBe(true);
    expect(described.href).toBe("/logistics/deliveries");
  });
});

describe("notifyCopyToAttention", () => {
  it("publishes to holders of the dispatch permission", async () => {
    findMany.mockResolvedValue([row(doc())]);

    await expect(notifyCopyToAttention("t1")).resolves.toBe("published");
    expect(watch.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        syncKey: "copy-to-follow",
        notification: expect.objectContaining({
          permissionKey: "logistics.delivery.dispatch",
          type: "sap.changes.copy-to-follow",
          href: "/logistics/deliveries/del1",
        }),
      }),
    );
  });

  it("does not ping again for the same documents in the same state", async () => {
    findMany.mockResolvedValue([row(doc())]);
    watch.get.mockResolvedValue({ fingerprint: attentionFingerprint([doc()]), notificationId: "n1" });
    watch.isNotificationLive.mockResolvedValue(true);

    await expect(notifyCopyToAttention("t1")).resolves.toBe("unchanged");
    expect(watch.publish).not.toHaveBeenCalled();
  });

  it("clears the open notification once nothing needs attention", async () => {
    findMany.mockResolvedValue([]);
    watch.get.mockResolvedValue({ fingerprint: "old", notificationId: "n1" });

    await expect(notifyCopyToAttention("t1")).resolves.toBe("cleared");
    expect(watch.clear).toHaveBeenCalledWith({ tenantId: "t1", syncKey: "copy-to-follow", previousNotificationId: "n1" });
  });

  it("only counts FAILED documents after a few retries", async () => {
    findMany.mockResolvedValue([]);
    await notifyCopyToAttention("t1");
    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { status: "FLAGGED" },
      { status: "FAILED", attempts: { gte: 3 } },
    ]);
  });
});
