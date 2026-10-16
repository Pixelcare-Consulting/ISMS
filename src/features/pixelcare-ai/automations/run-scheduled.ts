import type { AiAutomation, Prisma } from "@/lib/database/generated/prisma/client";

import { AI_ASSISTANT_OFF_MESSAGE } from "@/features/ai/constants/assistant-limits";
import { AssistantUserError } from "@/features/ai/lib/assistant-messages";
import { readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import {
  automationExecutors,
  missingExecutorError,
  type AutomationExecutorContext,
} from "@/features/pixelcare-ai/automations/executors";
import {
  decideAutomationDue,
  type DueDecision,
} from "@/features/pixelcare-ai/automations/schedule";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

export type AutomationCronOutcome = {
  automationId: string;
  tenantId: string;
  slot?: string;
  outcome: "not_due" | "already_ran" | "failed" | "succeeded";
  error?: string;
  runId?: string;
};

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof AssistantUserError) return error.message;
  return "The automation could not finish.";
}

async function claimRun(
  automation: Pick<AiAutomation, "id" | "tenantId">,
  slot: string,
): Promise<{ runId: string } | { alreadyRan: true }> {
  try {
    const run = await prisma.aiAutomationRun.create({
      data: {
        tenantId: automation.tenantId,
        automationId: automation.id,
        trigger: "schedule",
        status: "running",
        slot,
      },
      select: { id: true },
    });
    return { runId: run.id };
  } catch (error) {
    if (isUniqueConflict(error)) return { alreadyRan: true };
    throw error;
  }
}

async function finishRun(
  runId: string,
  data: { status: "succeeded"; result: Prisma.InputJsonObject } | { status: "failed"; error: string },
): Promise<void> {
  await prisma.aiAutomationRun.update({
    where: { id: runId },
    data: { ...data, finishedAt: new Date() },
  });
}

function executorContext(
  automation: AiAutomation,
  runId: string,
  slot: string,
): AutomationExecutorContext {
  return {
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
    runId,
    slot,
    trigger: "schedule",
  };
}

function failedOutcome(
  automation: Pick<AiAutomation, "id" | "tenantId">,
  slot: string,
  error: string,
  runId: string,
): AutomationCronOutcome {
  return {
    automationId: automation.id,
    tenantId: automation.tenantId,
    slot,
    outcome: "failed",
    error,
    runId,
  };
}

async function executeClaimedRun(
  automation: AiAutomation,
  decision: Exclude<DueDecision, { kind: "not_due" }>,
  runId: string,
): Promise<AutomationCronOutcome> {
  switch (decision.kind) {
    case "invalid_timezone":
    case "invalid_schedule":
      await finishRun(runId, { status: "failed", error: decision.error });
      return failedOutcome(automation, decision.slot, decision.error, runId);
    case "due": {
      const executor = automationExecutors[automation.template];
      if (!executor) {
        const error = missingExecutorError(automation.template);
        await finishRun(runId, { status: "failed", error });
        return failedOutcome(automation, decision.slot, error, runId);
      }

      try {
        const result = await executor(executorContext(automation, runId, decision.slot));
        await finishRun(runId, { status: "succeeded", result });
        return {
          automationId: automation.id,
          tenantId: automation.tenantId,
          slot: decision.slot,
          outcome: "succeeded",
          runId,
        };
      } catch (error) {
        const message = errorMessage(error);
        await finishRun(runId, { status: "failed", error: message });
        return failedOutcome(automation, decision.slot, message, runId);
      }
    }
    default: {
      const unreachable: never = decision;
      throw new Error(`Unhandled automation decision ${String(unreachable)}`);
    }
  }
}

/**
 * Finds enabled automations that are due in their own timezone and records one
 * run per `(automationId, slot)`. A second overlapping tick hits the unique key
 * and does not run again. A due template with no executor is stored as failed.
 */
export async function runDueAiAutomations(now: Date = new Date()): Promise<AutomationCronOutcome[]> {
  const automations = await prisma.aiAutomation.findMany({ where: { enabled: true } });
  const outcomes: AutomationCronOutcome[] = [];

  for (const automation of automations) {
    try {
      const policy = await readAiAssistantGate(automation.tenantId);
      if (!policy.ok) {
        outcomes.push({
          automationId: automation.id,
          tenantId: automation.tenantId,
          outcome: "failed",
          error: AI_ASSISTANT_OFF_MESSAGE,
        });
        continue;
      }

      const decision = decideAutomationDue(automation, now);
      if (decision.kind === "not_due") {
        outcomes.push({
          automationId: automation.id,
          tenantId: automation.tenantId,
          outcome: "not_due",
        });
        continue;
      }

      const claimed = await claimRun(automation, decision.slot);
      if ("alreadyRan" in claimed) {
        outcomes.push({
          automationId: automation.id,
          tenantId: automation.tenantId,
          slot: decision.slot,
          outcome: "already_ran",
        });
        continue;
      }

      outcomes.push(await executeClaimedRun(automation, decision, claimed.runId));
    } catch (error) {
      const message = errorMessage(error);
      logger.error(
        { automationId: automation.id, tenantId: automation.tenantId, err: message },
        "ai automation tick failed",
      );
      outcomes.push({
        automationId: automation.id,
        tenantId: automation.tenantId,
        outcome: "failed",
        error: message,
      });
    }
  }

  return outcomes;
}
