import type { AiAutomationTemplate, Prisma } from "@/lib/database/generated/prisma/client";

import { issueReplenishmentConfirmation } from "@/features/pixelcare-ai/automations/confirmation";
import { runSavedAutomation } from "@/features/pixelcare-ai/automations/manual-run";
import { zonedClock } from "@/features/pixelcare-ai/automations/schedule";
import {
  parseReminderThresholds,
  PROPOSED_NOT_CREATED,
  readMinSug,
  REMINDER_STATUSES,
} from "@/features/pixelcare-ai/automations/proposal-lines";
import {
  AUTOMATION_TEMPLATES,
  defaultThresholds,
  templateCopy,
  type AutomationCardView,
  type AutomationProposalView,
  type AutomationRunView,
  type AutomationTemplateId,
  type AutomationWorkspace,
} from "@/features/pixelcare-ai/automations/view-model";
import { listPermittedBranches } from "@/features/pixelcare-ai/tools/branch-access";
import type { AppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/database/client";

const RUN_HISTORY_LIMIT = 12;

export function isMissingAutomationStorage(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = String((error as { code: unknown }).code);
  return code === "P2021" || code === "P2022";
}

function asTemplate(template: AiAutomationTemplate): AutomationTemplateId {
  switch (template) {
    case "daily_briefing":
    case "replenishment_review":
    case "pending_work_reminder":
      return template;
    default: {
      const unreachable: never = template;
      return unreachable;
    }
  }
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function loadAutomationWorkspace(session: AppSession): Promise<AutomationWorkspace> {
  await ensureOwnerTemplates(session.user.tenantId, session.user.id);
  const [rows, branches, users] = await Promise.all([
    prisma.aiAutomation.findMany({
      where: { tenantId: session.user.tenantId, ownerUserId: session.user.id },
      orderBy: { createdAt: "asc" },
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take: RUN_HISTORY_LIMIT,
          include: {
            proposals: {
              include: {
                branch: { select: { name: true } },
                order: { select: { orderNumber: true } },
              },
            },
          },
        },
      },
    }),
    listPermittedBranches(session),
    prisma.user.findMany({
      where: { tenantId: session.user.tenantId, deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  const byTemplate = new Map(rows.map((row) => [row.template, row]));
  const cards: AutomationCardView[] = await Promise.all(AUTOMATION_TEMPLATES.map(async (template) => {
    const row = byTemplate.get(template);
    const copy = templateCopy(template);
    if (!row) {
      return {
        id: "",
        template,
        ...copy,
        enabled: false,
        timezone: "Asia/Manila",
        timeOfDayMinutes: 8 * 60,
        weekdays: [1, 2, 3, 4, 5],
        branchIds: [],
        recipientUserIds: [],
        thresholds: defaultThresholds(template),
        runs: [],
        proposals: [],
      };
    }
    const proposals: AutomationProposalView[] = [];
    for (const run of row.runs) {
      for (const proposal of run.proposals) {
        const open = proposal.status === "proposed" && !proposal.orderId;
        let confirmationToken: string | null = null;
        if (open) {
          try {
            const issued = await issueReplenishmentConfirmation({
              tenantId: session.user.tenantId,
              userId: session.user.id,
              proposalId: proposal.id,
            });
            confirmationToken = issued.token;
          } catch {
            confirmationToken = null;
          }
        }
        proposals.push({
          id: proposal.id,
          branchId: proposal.branchId,
          branchName: proposal.branch.name,
          status: proposal.status,
          orderId: proposal.orderId,
          orderNumber: proposal.order?.orderNumber ?? null,
          lines: proposal.lines,
          label: proposal.orderId ? "Order created" : PROPOSED_NOT_CREATED,
          confirmationToken,
        });
      }
    }
    const runs: AutomationRunView[] = row.runs.map((run) => ({
      id: run.id,
      trigger: run.trigger,
      status: run.status,
      error: run.error,
      startedAt: run.startedAt.toISOString(),
      result: run.result,
    }));
    return {
      id: row.id,
      template: asTemplate(row.template),
      ...copy,
      enabled: row.enabled,
      timezone: row.timezone,
      timeOfDayMinutes: row.timeOfDayMinutes,
      weekdays: row.weekdays,
      branchIds: row.branchIds,
      recipientUserIds: row.recipientUserIds,
      thresholds: asRecord(row.thresholds),
      runs,
      proposals,
    };
  }));

  return {
    cards,
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      sapCode: branch.sapCode,
    })),
    users: users.map((user) => ({ id: user.id, name: user.name, email: user.email })),
  };
}

async function ensureOwnerTemplates(tenantId: string, ownerUserId: string) {
  const existing = await prisma.aiAutomation.findMany({
    where: { tenantId, ownerUserId },
    select: { template: true },
  });
  const have = new Set(existing.map((row) => row.template));
  const missing = AUTOMATION_TEMPLATES.filter((template) => !have.has(template));
  if (missing.length === 0) return;
  await prisma.aiAutomation.createMany({
    data: missing.map((template) => ({
      tenantId,
      ownerUserId,
      template,
      enabled: false,
      timezone: "Asia/Manila",
      timeOfDayMinutes: 8 * 60,
      weekdays: [1, 2, 3, 4, 5],
      thresholds: defaultThresholds(template) as Prisma.InputJsonObject,
      branchIds: [],
      recipientUserIds: [],
    })),
  });
}

export type AutomationSettingsInput = {
  automationId: string;
  enabled: boolean;
  timezone: string;
  timeOfDayMinutes: number;
  weekdays: number[];
  branchIds: string[];
  recipientUserIds: string[];
  thresholds: Record<string, unknown>;
};

export async function saveAutomationSettings(
  session: AppSession,
  input: AutomationSettingsInput,
): Promise<void> {
  const automation = await prisma.aiAutomation.findFirst({
    where: {
      id: input.automationId,
      tenantId: session.user.tenantId,
      ownerUserId: session.user.id,
    },
  });
  if (!automation) throw new Error("Automation not found.");

  try {
    zonedClock(new Date(), input.timezone);
  } catch {
    throw new Error("Enter a valid timezone, such as Asia/Manila.");
  }
  if (
    !Number.isInteger(input.timeOfDayMinutes) ||
    input.timeOfDayMinutes < 0 ||
    input.timeOfDayMinutes > 1439
  ) {
    throw new Error("Choose a time between 00:00 and 23:59.");
  }
  if (
    input.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new Error("Weekdays must be Sunday through Saturday.");
  }

  const branches = await listPermittedBranches(session);
  const allowed = new Set(branches.map((branch) => branch.id));
  const deniedBranch = input.branchIds.find((id) => !allowed.has(id));
  if (deniedBranch) {
    throw new Error("One or more branches are outside your access.");
  }

  const users = await prisma.user.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      id: { in: input.recipientUserIds },
    },
    select: { id: true },
  });
  if (users.length !== new Set(input.recipientUserIds).size) {
    throw new Error("One or more recipients are not in this tenant.");
  }

  const thresholds = normalizeThresholds(asTemplate(automation.template), input.thresholds);

  await prisma.aiAutomation.update({
    where: { id: automation.id },
    data: {
      enabled: input.enabled,
      timezone: input.timezone,
      timeOfDayMinutes: input.timeOfDayMinutes,
      weekdays: [...new Set(input.weekdays)].sort((a, b) => a - b),
      branchIds: input.branchIds,
      recipientUserIds: input.recipientUserIds,
      thresholds,
    },
  });
}

function normalizeThresholds(
  template: AutomationTemplateId,
  raw: Record<string, unknown>,
): Prisma.InputJsonObject {
  switch (template) {
    case "daily_briefing":
      return {};
    case "replenishment_review":
      return { minSug: readMinSug(raw) };
    case "pending_work_reminder": {
      const parsed = parseReminderThresholds({
        olderThanDays: raw.olderThanDays,
        statuses: raw.statuses ?? [...REMINDER_STATUSES],
      });
      return { olderThanDays: parsed.olderThanDays, statuses: parsed.statuses };
    }
    default: {
      const unreachable: never = template;
      return unreachable;
    }
  }
}

export async function runOwnerAutomation(
  session: AppSession,
  automationId: string,
  trigger: "manual" | "preview",
) {
  return runSavedAutomation({
    tenantId: session.user.tenantId,
    actorUserId: session.user.id,
    automationId,
    trigger,
  });
}
