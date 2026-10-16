import type { AiAutomationTemplate, Prisma } from "@/lib/database/generated/prisma/client";

import { executeDailyBriefing } from "@/features/pixelcare-ai/automations/briefing";
import { executePendingWorkReminder } from "@/features/pixelcare-ai/automations/reminders";
import { executeReplenishmentReview } from "@/features/pixelcare-ai/automations/replenishment";

/**
 * Context for a template executor. `ownerUserId` is the permission-recheck hook:
 * the executor must use that user's current permissions and branch access before
 * it writes. Do not add a new permission slug.
 */
export type AutomationExecutorContext = {
  automationId: string;
  tenantId: string;
  ownerUserId: string;
  template: AiAutomationTemplate;
  timezone: string;
  timeOfDayMinutes: number;
  weekdays: number[];
  branchIds: string[];
  thresholds: Prisma.JsonValue;
  recipientUserIds: string[];
  runId: string;
  slot: string;
  trigger: "schedule" | "manual" | "preview";
};

export type AutomationExecutor = (
  context: AutomationExecutorContext,
) => Promise<Prisma.InputJsonObject>;

/**
 * Template executors. Replenishment, briefing, and reminder agents register here.
 * A missing entry is not success — the scheduler marks that run failed.
 */
export const automationExecutors: Partial<Record<AiAutomationTemplate, AutomationExecutor>> = {
  daily_briefing: executeDailyBriefing,
  replenishment_review: executeReplenishmentReview,
  pending_work_reminder: executePendingWorkReminder,
};

export function missingExecutorError(template: AiAutomationTemplate): string {
  return `Executor for template ${template} is not implemented`;
}
