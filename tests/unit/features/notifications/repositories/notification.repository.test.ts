jest.mock("@/lib/database/client", () => ({
  prisma: {
    notification: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import type { Prisma } from "@prisma/client";

import {
  notificationRepository,
  type InboxViewer,
} from "@/features/notifications/repositories/notification.repository";
import { prisma } from "@/lib/database/client";

const viewer: InboxViewer = {
  tenantId: "t1",
  userId: "u1",
  roleSlugs: ["tl"],
  permissions: ["warehouses.manage", "inventory.manage"],
};

const count = prisma.notification.count as jest.Mock;
const create = prisma.notification.create as jest.Mock;

/** The audience `OR` inside the where the repository sent to `count`. */
function audienceClauses(where: Prisma.NotificationWhereInput) {
  const and = (where.AND ?? []) as Prisma.NotificationWhereInput[];
  const withAudience = and.find((clause) =>
    clause.OR?.some((option) => "audience" in option),
  );
  return withAudience?.OR ?? [];
}

describe("notificationRepository — PERMISSION audience", () => {
  it("matches PERMISSION notifications against the viewer's permissions", async () => {
    await notificationRepository.countUnreadForUser(viewer);

    const where = count.mock.calls[0][0].where.AND[0];
    expect(audienceClauses(where)).toContainEqual({
      audience: "PERMISSION",
      permissionKey: { in: ["warehouses.manage", "inventory.manage"] },
    });
  });

  it("leaves PERMISSION out entirely for a viewer with no permissions", async () => {
    await notificationRepository.countUnreadForUser({ ...viewer, permissions: [] });

    const where = count.mock.calls[0][0].where.AND[0];
    expect(audienceClauses(where).map((clause) => clause.audience)).toEqual([
      "TENANT",
      "USER",
      "ROLE",
    ]);
  });

  it("applies the same filter when listing, so list and count agree", async () => {
    await notificationRepository.listVisibleForUser(viewer);

    const listWhere = (prisma.notification.findMany as jest.Mock).mock.calls[0][0].where;
    expect(audienceClauses(listWhere)).toContainEqual({
      audience: "PERMISSION",
      permissionKey: { in: viewer.permissions },
    });
  });

  it("stores permissionKey only for PERMISSION notifications", async () => {
    await notificationRepository.create({
      tenantId: "t1",
      audience: "PERMISSION",
      permissionKey: "warehouses.manage",
      type: "sap.changes.warehouse",
      title: "SAP has new data for Warehouses",
    });
    await notificationRepository.create({
      tenantId: "t1",
      audience: "TENANT",
      permissionKey: "warehouses.manage",
      type: "announcement",
      title: "Hello",
    });

    expect(create.mock.calls[0][0].data.permissionKey).toBe("warehouses.manage");
    expect(create.mock.calls[1][0].data.permissionKey).toBeNull();
  });
});
