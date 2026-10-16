jest.mock("@/lib/database/client", () => ({
  prisma: {
    user: { findMany: jest.fn(), findFirst: jest.fn() },
    branchOrder: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    aiAutomationRun: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    aiAutomation: { findFirst: jest.fn(), create: jest.fn() },
    aiReplenishmentProposal: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    productModel: { findMany: jest.fn() },
    permission: { findMany: jest.fn() },
    role: { findMany: jest.fn() },
  },
}));

jest.mock("@/features/orders/services/order.service", () => ({
  orderService: { create: jest.fn() },
}));

jest.mock("@/features/orders/services/order-analytics.service", () => ({
  orderAnalyticsService: { getWorkspace: jest.fn() },
}));

jest.mock("@/features/notifications/repositories/notification.repository", () => ({
  notificationRepository: { create: jest.fn() },
}));

jest.mock("@/lib/aor/scope", () => ({
  getUserBranchIds: jest.fn(),
}));

jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, permission: string) =>
    permissions?.includes(permission) ?? false,
}));

import type { AutomationExecutorContext } from "@/features/pixelcare-ai/automations/executors";
import { executeDailyBriefing } from "@/features/pixelcare-ai/automations/briefing";
import { executePendingWorkReminder } from "@/features/pixelcare-ai/automations/reminders";
import { executeReplenishmentReview } from "@/features/pixelcare-ai/automations/replenishment";
import type { OwnerAccess } from "@/features/pixelcare-ai/automations/owner-access";
import { computeSugQty } from "@/features/pixelcare-ai/lib/sug";
import {
  automationLocalDay,
  buildReplenishmentLines,
  confirmOpenProposal,
  orderableReplenishmentLines,
  PROPOSED_NOT_CREATED,
} from "@/features/pixelcare-ai/automations/proposal-lines";
import { notificationRepository } from "@/features/notifications/repositories/notification.repository";
import { orderService } from "@/features/orders/services/order.service";

const createOrder = orderService.create as jest.Mock;
const createNotification = notificationRepository.create as jest.Mock;

function access(overrides: Partial<OwnerAccess> = {}): OwnerAccess {
  return {
    userId: "owner-1",
    tenantId: "tenant-1",
    email: "owner@example.com",
    permissions: ["orders.auto_replenish.create", "orders.auto_replenish.view", "planogram.view"],
    roleSlugs: ["ps"],
    aorBranchIds: ["branch-1"],
    fullOrderAccess: false,
    pixelcare: true,
    ...overrides,
  };
}

function context(
  overrides: Partial<AutomationExecutorContext> = {},
): AutomationExecutorContext {
  return {
    automationId: "auto-1",
    tenantId: "tenant-1",
    ownerUserId: "owner-1",
    template: "replenishment_review",
    timezone: "Asia/Manila",
    timeOfDayMinutes: 8 * 60,
    weekdays: [5],
    branchIds: ["branch-1"],
    thresholds: { minSug: 1 },
    recipientUserIds: ["user-2"],
    runId: "run-1",
    slot: "preview:2026-10-16T00:00:00.000Z",
    trigger: "preview",
    ...overrides,
  };
}

describe("replenishment proposal lines", () => {
  it("sets SUG to computeSugQty and keeps hold SKUs out of the order", () => {
    const lines = buildReplenishmentLines([
      { modelId: "m1", sku: "SKU-1", shelfMax: 6, stk: 4, modelStatus: "active" },
      { modelId: "m2", sku: "SKU-2", shelfMax: 5, stk: 1, modelStatus: "hold" },
    ]);

    expect(lines[0]).toMatchObject({ sku: "SKU-1", sug: computeSugQty(6, 4), exceptions: [] });
    expect(lines[1]?.sug).toBe(computeSugQty(5, 1));
    expect(lines[1]?.exceptions).toEqual(["SKU is hold and cannot be ordered"]);
    expect(orderableReplenishmentLines(lines).map((line) => line.sku)).toEqual(["SKU-1"]);
  });

  it("uses the automation timezone for the local calendar day", () => {
    const now = new Date("2026-10-16T00:00:00.000Z");
    expect(automationLocalDay(now, "Asia/Manila")).toBe("2026-10-16");
    expect(automationLocalDay(now, "America/New_York")).toBe("2026-10-15");
  });
});

describe("confirmOpenProposal", () => {
  it("does not create a second order when the proposal already has one", async () => {
    const createDraft = jest.fn().mockResolvedValue({ id: "order-2" });
    const first = await confirmOpenProposal(
      { status: "proposed", orderId: null },
      {
        assertMayConfirm: async () => undefined,
        createDraft: async () => ({ id: "order-1" }),
        reread: async () => ({ status: "confirmed", orderId: "order-1" }),
        attach: async () => true,
      },
    );
    const second = await confirmOpenProposal(
      { status: "confirmed", orderId: "order-1" },
      {
        assertMayConfirm: async () => {
          throw new Error("should not recheck after the order exists");
        },
        createDraft,
        reread: async () => null,
        attach: async () => true,
      },
    );

    expect(first).toEqual({ kind: "created", orderId: "order-1" });
    expect(second).toEqual({ kind: "existing", orderId: "order-1" });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("does not create an order when confirmation is denied", async () => {
    const createDraft = jest.fn();
    await expect(
      confirmOpenProposal(
        { status: "proposed", orderId: null },
        {
          assertMayConfirm: async () => {
            throw new Error("Auto replenish create permission was lost. Nothing was saved.");
          },
          createDraft,
          reread: async () => null,
          attach: async () => true,
        },
      ),
    ).rejects.toThrow(/Nothing was saved/);
    expect(createDraft).not.toHaveBeenCalled();
  });
});

describe("automation preview and access denial", () => {
  beforeEach(() => {
    createOrder.mockReset();
    createNotification.mockReset();
  });

  it("preview does not create orders or notifications", async () => {
    const saveProposal = jest.fn().mockResolvedValue({ id: "proposal-1", reused: false });
    const notify = jest.fn();
    const replenishment = await executeReplenishmentReview(context(), {
      loadAccess: async () => access(),
      readBranch: async () => ({
        branchId: "branch-1",
        branchName: "Store",
        lines: buildReplenishmentLines([
          { modelId: "m1", sku: "SKU-1", shelfMax: 6, stk: 4, modelStatus: "active" },
        ]),
        exceptions: [],
        href: "/orders/auto-replenish?tab=analytics",
      }),
      saveProposal,
    });
    await executeDailyBriefing(context({ template: "daily_briefing" }), {
      loadAccess: async () => access(),
      readShelfGaps: async () => ({ branchName: "Store", lineCount: 1, totalSug: 2 }),
      readPending: async () => ({ total: 1, items: [] }),
      findRecipients: async () => ["user-2"],
      alreadyNotified: async () => false,
      notify,
    });
    await executePendingWorkReminder(
      context({
        template: "pending_work_reminder",
        thresholds: { olderThanDays: 3, statuses: ["draft"] },
      }),
      {
        loadAccess: async () => access(),
        findRecipients: async () => ["user-2"],
        findStaleOrders: async () => [
          {
            orderNumber: "SO#2026-10-00009",
            status: "draft",
            statusLabel: "Draft",
            href: "/orders/manual",
            ageDays: 4,
          },
        ],
        alreadyNotified: async () => false,
        notify,
      },
    );

    expect(replenishment).toMatchObject({
      label: PROPOSED_NOT_CREATED,
      orderCreated: false,
    });
    expect(saveProposal).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("does not write a proposal or notification when branch access was lost", async () => {
    const saveProposal = jest.fn();
    const readBranch = jest.fn();
    const notify = jest.fn();
    const denied = access({ aorBranchIds: ["other-branch"] });

    await expect(
      executeReplenishmentReview(context(), {
        loadAccess: async () => denied,
        readBranch,
        saveProposal,
      }),
    ).rejects.toThrow(/Branch access was lost/);
    await expect(
      executeDailyBriefing(context({ template: "daily_briefing", trigger: "manual" }), {
        loadAccess: async () => denied,
        readShelfGaps: jest.fn(),
        readPending: jest.fn(),
        findRecipients: jest.fn(),
        alreadyNotified: async () => false,
        notify,
      }),
    ).rejects.toThrow(/Branch access was lost/);

    expect(saveProposal).not.toHaveBeenCalled();
    expect(readBranch).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("fails an unknown recipient before any notification", async () => {
    const notify = jest.fn();
    await expect(
      executeDailyBriefing(context({ template: "daily_briefing", trigger: "manual" }), {
        loadAccess: async () => access(),
        readShelfGaps: jest.fn(),
        readPending: jest.fn(),
        findRecipients: async () => [],
        alreadyNotified: async () => false,
        notify,
      }),
    ).rejects.toThrow(/Recipient is not in this tenant/);
    expect(notify).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("fails an unsupported reminder status before any notification", async () => {
    const notify = jest.fn();
    const findStaleOrders = jest.fn();
    await expect(
      executePendingWorkReminder(
        context({
          template: "pending_work_reminder",
          trigger: "manual",
          thresholds: { olderThanDays: 3, statuses: ["approved"] },
        }),
        {
          loadAccess: async () => access(),
          findRecipients: async () => ["user-2"],
          findStaleOrders,
          alreadyNotified: async () => false,
          notify,
        },
      ),
    ).rejects.toThrow(/not supported/);
    expect(notify).not.toHaveBeenCalled();
    expect(findStaleOrders).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });
});
