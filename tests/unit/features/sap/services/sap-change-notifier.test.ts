jest.mock("@/features/sap/repositories/sap-change-watch.repository", () => ({
  SAP_CHANGE_NOTIFICATION_PREFIX: "sap.changes.",
  sapChangeWatchRepository: {
    clear: jest.fn().mockResolvedValue(true),
    isNotificationLive: jest.fn(),
    publish: jest.fn().mockResolvedValue("n-new"),
    purgeClosedNotifications: jest.fn().mockResolvedValue(0),
  },
}));

import { sapChangeWatchRepository } from "@/features/sap/repositories/sap-change-watch.repository";
import {
  describeSapChanges,
  notifySapChanges,
  purgeClosedSapChangeNotifications,
  sapChangeFingerprint,
  type SapChangeSet,
  type SapChangeTarget,
} from "@/features/sap/services/sap-change-notifier";

const repo = sapChangeWatchRepository as jest.Mocked<typeof sapChangeWatchRepository>;

const target: SapChangeTarget = {
  syncKey: "warehouse",
  label: "Warehouses",
  permission: "warehouses.manage",
  href: "/settings/warehouses",
};

const changes: SapChangeSet = { created: ["W2"], updated: ["W1", "W3"], removed: [] };
const none: SapChangeSet = { created: [], updated: [], removed: [] };

describe("sapChangeFingerprint", () => {
  it("is null when nothing changed", () => {
    expect(sapChangeFingerprint(none)).toBeNull();
  });

  it("ignores key order", () => {
    expect(sapChangeFingerprint({ ...changes, updated: ["W3", "W1"] })).toBe(
      sapChangeFingerprint(changes),
    );
  });

  it("tells a created key from the same key updated", () => {
    expect(sapChangeFingerprint({ created: ["W1"], updated: [], removed: [] })).not.toBe(
      sapChangeFingerprint({ created: [], updated: ["W1"], removed: [] }),
    );
  });
});

describe("describeSapChanges", () => {
  it("names the page and only the non-zero counts", () => {
    expect(describeSapChanges(target, changes)).toEqual({
      title: "SAP has new data for Warehouses",
      body: "1 new · 2 updated in SAP. Open Warehouses and press Sync to bring them into ISMS.",
    });
  });

  it("marks a capped count with +", () => {
    const capped = { created: Array.from({ length: 5000 }, (_, i) => `S${i}`), updated: [], removed: [], createdCapped: true };
    expect(describeSapChanges(target, capped).body).toMatch(/^5,000\+ new in SAP/);
  });
});

describe("notifySapChanges", () => {
  const empty = { fingerprint: null, notificationId: null };

  it("does nothing when there are no changes and nothing open", async () => {
    await expect(notifySapChanges({ tenantId: "t1", target, watch: empty, changes: none })).resolves.toBe("none");
    expect(repo.clear).not.toHaveBeenCalled();
    expect(repo.publish).not.toHaveBeenCalled();
  });

  it("clears the open notification once SAP and ISMS agree (after a manual Sync)", async () => {
    const outcome = await notifySapChanges({
      tenantId: "t1",
      target,
      watch: { fingerprint: "old", notificationId: "n1" },
      changes: none,
    });
    expect(outcome).toBe("cleared");
    expect(repo.clear).toHaveBeenCalledWith({ tenantId: "t1", syncKey: "warehouse", previousNotificationId: "n1" });
  });

  it("leaves the same news alone — no re-ping", async () => {
    repo.isNotificationLive.mockResolvedValue(true);
    const outcome = await notifySapChanges({
      tenantId: "t1",
      target,
      watch: { fingerprint: sapChangeFingerprint(changes), notificationId: "n1" },
      changes,
    });
    expect(outcome).toBe("unchanged");
    expect(repo.publish).not.toHaveBeenCalled();
  });

  it("replaces the notification when the changes differ", async () => {
    const outcome = await notifySapChanges({
      tenantId: "t1",
      target,
      watch: { fingerprint: "something-else", notificationId: "n1" },
      changes,
    });
    expect(outcome).toBe("published");
    const call = repo.publish.mock.calls[0][0];
    expect(call.previousNotificationId).toBe("n1");
    expect(call.fingerprint).toBe(sapChangeFingerprint(changes));
    expect(call.notification).toMatchObject({
      permissionKey: "warehouses.manage",
      type: "sap.changes.warehouse",
      href: "/settings/warehouses",
      metadata: { syncKey: "warehouse", counts: { created: 1, updated: 2, removed: 0 } },
    });
  });

  it("steps aside when an overlapping check already published", async () => {
    repo.publish.mockResolvedValueOnce(null);
    const outcome = await notifySapChanges({ tenantId: "t1", target, watch: empty, changes });
    expect(outcome).toBe("unchanged");
  });

  it("re-publishes same news if its notification is gone", async () => {
    repo.isNotificationLive.mockResolvedValue(false);
    const outcome = await notifySapChanges({
      tenantId: "t1",
      target,
      watch: { fingerprint: sapChangeFingerprint(changes), notificationId: "n1" },
      changes,
    });
    expect(outcome).toBe("published");
  });
});

describe("purgeClosedSapChangeNotifications", () => {
  it("purges what was closed more than 30 days ago", async () => {
    await purgeClosedSapChangeNotifications(new Date("2026-10-31T00:00:00Z"));
    expect(repo.purgeClosedNotifications).toHaveBeenCalledWith(new Date("2026-10-01T00:00:00Z"));
  });
});
