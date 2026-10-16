import type { Prisma } from "@/lib/database/generated/prisma/client";

import {
  automationExecutors,
  missingExecutorError,
  type AutomationExecutorContext,
} from "@/features/pixelcare-ai/automations/executors";
import { prisma } from "@/lib/database/client";

export type ManualRunResult = {
  runId: string;
  status: "succeeded" | "failed";
  result: Prisma.InputJsonObject | null;
  error: string | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Preview and Run now for one automation. The slot is unique per click so it
 * does not collide with the scheduled slot. Preview still goes through the
 * executor, which must not create orders or notifications.
 */
export async function runSavedAutomation(input: {
  tenantId: string;
  actorUserId: string;
  automationId: string;
  trigger: "manual" | "preview";
  now?: Date;
}): Promise<ManualRunResult> {
  const automation = await prisma.aiAutomation.findFirst({
    where: {
      id: input.automationId,
      tenantId: input.tenantId,
      ownerUserId: input.actorUserId,
    },
  });
  if (!automation) throw new Error("Automation not found.");

  const now = input.now ?? new Date();
  const slot = `${input.trigger}:${now.toISOString()}`;
  const run = await prisma.aiAutomationRun.create({
    data: {
      tenantId: automation.tenantId,
      automationId: automation.id,
      trigger: input.trigger,
      actorUserId: input.actorUserId,
      status: "running",
      slot,
    },
    select: { id: true },
  });

  const executor = automationExecutors[automation.template];
  if (!executor) {
    const error = missingExecutorError(automation.template);
    await prisma.aiAutomationRun.update({
      where: { id: run.id },
      data: { status: "failed", error, finishedAt: new Date() },
    });
    return { runId: run.id, status: "failed", result: null, error };
  }

  const context: AutomationExecutorContext = {
    automationId: automation.id,
    tenantId: automation.tenantId,
    ownerUserId: automation.ownerUserId,
    template: automation.template,
    timezone: automation.timezone,
    timeOfDayMinutes: automation.timeOfDayMinutes,
    weekdays: automation.weekdays,
    branchIds: automation.branchIds,
    thresholds: automation.thresholds,
    recipientUserIds: automation.recipientUserIds,
    runId: run.id,
    slot,
    trigger: input.trigger,
  };

  try {
    const result = await executor(context);
    await prisma.aiAutomationRun.update({
      where: { id: run.id },
      data: { status: "succeeded", result, finishedAt: new Date() },
    });
    return { runId: run.id, status: "succeeded", result, error: null };
  } catch (error) {
    const message = errorMessage(error);
    await prisma.aiAutomationRun.update({
      where: { id: run.id },
      data: { status: "failed", error: message, finishedAt: new Date() },
    });
    return { runId: run.id, status: "failed", result: null, error: message };
  }
}
