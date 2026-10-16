import type { AiAutomationTemplate } from "@/lib/database/generated/prisma/client";

export const AUTOMATION_TEMPLATES = [
  "daily_briefing",
  "replenishment_review",
  "pending_work_reminder",
] as const satisfies readonly AiAutomationTemplate[];

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type AutomationTemplateId = (typeof AUTOMATION_TEMPLATES)[number];

export type AutomationRunView = {
  id: string;
  trigger: "schedule" | "manual" | "preview";
  status: "running" | "succeeded" | "failed";
  error: string | null;
  startedAt: string;
  result: unknown;
};

export type AutomationProposalView = {
  id: string;
  branchId: string;
  branchName: string;
  status: "proposed" | "confirmed" | "superseded";
  orderId: string | null;
  orderNumber: string | null;
  lines: unknown;
  label: string;
};

export type AutomationCardView = {
  id: string;
  template: AutomationTemplateId;
  title: string;
  description: string;
  enabled: boolean;
  timezone: string;
  timeOfDayMinutes: number;
  weekdays: number[];
  branchIds: string[];
  recipientUserIds: string[];
  thresholds: Record<string, unknown>;
  runs: AutomationRunView[];
  proposals: AutomationProposalView[];
};

export type AutomationWorkspace = {
  cards: AutomationCardView[];
  branches: Array<{ id: string; name: string; sapCode: string }>;
  users: Array<{ id: string; name: string; email: string }>;
};

export function templateCopy(template: AutomationTemplateId): { title: string; description: string } {
  switch (template) {
    case "daily_briefing":
      return {
        title: "Daily briefing",
        description: "A short summary of shelf gaps and orders still in progress, sent in the app.",
      };
    case "replenishment_review":
      return {
        title: "Replenishment review",
        description:
          "Proposes shelf-gap quantities. An order is created only after you confirm. It is not sent to SAP.",
      };
    case "pending_work_reminder":
      return {
        title: "Pending-work reminders",
        description: "In-app reminders for drafts or orders waiting for approval past the number of days you set.",
      };
    default: {
      const unreachable: never = template;
      return unreachable;
    }
  }
}

export function defaultThresholds(template: AutomationTemplateId): Record<string, unknown> {
  switch (template) {
    case "daily_briefing":
      return {};
    case "replenishment_review":
      return { minSug: 1 };
    case "pending_work_reminder":
      return { olderThanDays: 3, statuses: ["draft", "pending_tl", "pending_sp"] };
    default: {
      const unreachable: never = template;
      return unreachable;
    }
  }
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}
