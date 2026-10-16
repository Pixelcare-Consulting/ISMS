jest.mock("@/lib/database/client", () => ({
  prisma: {
    aiAutomation: { findMany: jest.fn() },
    aiAutomationRun: { create: jest.fn(), update: jest.fn() },
  },
}));
jest.mock("@/lib/shared/logger", () => ({ logger: { error: jest.fn() } }));
jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, permission: string) =>
    permissions?.includes(permission) ?? false,
}));

import { automationExecutors } from "@/features/pixelcare-ai/automations/executors";
import { runDueAiAutomations } from "@/features/pixelcare-ai/automations/run-scheduled";
import { prisma } from "@/lib/database/client";

const findMany = prisma.aiAutomation.findMany as jest.Mock;
const createRun = prisma.aiAutomationRun.create as jest.Mock;
const updateRun = prisma.aiAutomationRun.update as jest.Mock;

const dueNow = new Date("2026-10-16T00:00:00.000Z");

function automation() {
  return {
    id: "auto-1",
    tenantId: "tenant-1",
    ownerUserId: "owner-1",
    template: "replenishment_review" as const,
    enabled: true,
    timezone: "Asia/Manila",
    timeOfDayMinutes: 8 * 60,
    weekdays: [5],
    branchIds: ["branch-1"],
    thresholds: { minSug: 1 },
    recipientUserIds: ["user-2"],
  };
}

describe("runDueAiAutomations", () => {
  afterEach(() => {
    delete automationExecutors.replenishment_review;
    jest.resetAllMocks();
  });

  it("records a failed run when the due template has no executor", async () => {
    delete automationExecutors.replenishment_review;
    findMany.mockResolvedValue([automation()]);
    createRun.mockResolvedValue({ id: "run-1" });
    updateRun.mockResolvedValue({});

    const outcomes = await runDueAiAutomations(dueNow);

    expect(outcomes).toEqual([
      {
        automationId: "auto-1",
        tenantId: "tenant-1",
        slot: "2026-10-16T08:00",
        outcome: "failed",
        error: "Executor for template replenishment_review is not implemented",
        runId: "run-1",
      },
    ]);
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          automationId: "auto-1",
          trigger: "schedule",
          status: "running",
          slot: "2026-10-16T08:00",
        }),
      }),
    );
    expect(updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("does not execute again when the slot was already claimed", async () => {
    findMany.mockResolvedValue([automation()]);
    createRun.mockRejectedValue({ code: "P2002" });
    automationExecutors.replenishment_review = jest.fn();

    const outcomes = await runDueAiAutomations(dueNow);

    expect(outcomes).toEqual([
      {
        automationId: "auto-1",
        tenantId: "tenant-1",
        slot: "2026-10-16T08:00",
        outcome: "already_ran",
      },
    ]);
    expect(automationExecutors.replenishment_review).not.toHaveBeenCalled();
    expect(updateRun).not.toHaveBeenCalled();
  });

  it("passes the owner id into a registered executor", async () => {
    findMany.mockResolvedValue([automation()]);
    createRun.mockResolvedValue({ id: "run-2" });
    updateRun.mockResolvedValue({});
    automationExecutors.replenishment_review = jest.fn().mockResolvedValue({ proposals: 1 });

    const outcomes = await runDueAiAutomations(dueNow);

    expect(automationExecutors.replenishment_review).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: "owner-1",
        tenantId: "tenant-1",
        runId: "run-2",
        trigger: "schedule",
      }),
    );
    expect(outcomes[0]?.outcome).toBe("succeeded");
  });

  it("does not claim a run before the local scheduled time", async () => {
    findMany.mockResolvedValue([automation()]);

    const outcomes = await runDueAiAutomations(new Date("2026-10-15T23:59:00.000Z"));

    expect(outcomes).toEqual([
      { automationId: "auto-1", tenantId: "tenant-1", outcome: "not_due" },
    ]);
    expect(createRun).not.toHaveBeenCalled();
  });
});
