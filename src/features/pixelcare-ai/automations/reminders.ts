import type { Prisma } from "@/lib/database/generated/prisma/client";

import type { AutomationExecutorContext } from "@/features/pixelcare-ai/automations/executors";
import {
  assertCanReadReminders,
  loadOwnerAccess,
  resolveScopedBranches,
  type OwnerAccess,
} from "@/features/pixelcare-ai/automations/owner-access";
import {
  assertKnownRecipients,
  automationLocalDay,
  notificationDecision,
  parseReminderThresholds,
  type ReminderStatus,
} from "@/features/pixelcare-ai/automations/proposal-lines";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import { ORDER_TYPE_ROUTE } from "@/features/orders/constants/order-permissions";
import { notificationRepository } from "@/features/notifications/repositories/notification.repository";
import { prisma } from "@/lib/database/client";

const REMINDER_LIMIT = 20;

type ReminderItem = {
  orderNumber: string;
  status: ReminderStatus;
  statusLabel: string;
  href: string;
  ageDays: number;
};

type ReminderIo = {
  loadAccess: (tenantId: string, userId: string) => Promise<OwnerAccess>;
  findRecipients: (tenantId: string, userIds: string[]) => Promise<string[]>;
  findStaleOrders: (input: {
    tenantId: string;
    branchIds: string[];
    statuses: ReminderStatus[];
    olderThanDays: number;
    now: Date;
  }) => Promise<ReminderItem[]>;
  alreadyNotified: (automationId: string, localDay: string) => Promise<boolean>;
  notify: (input: {
    tenantId: string;
    userId: string;
    title: string;
    body: string;
    href: string;
    createdById: string;
  }) => Promise<void>;
};

async function findRecipientIds(tenantId: string, userIds: string[]) {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { tenantId, deletedAt: null, id: { in: userIds } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function findStaleOrders(input: {
  tenantId: string;
  branchIds: string[];
  statuses: ReminderStatus[];
  olderThanDays: number;
  now: Date;
}): Promise<ReminderItem[]> {
  const cutoff = new Date(input.now.getTime() - input.olderThanDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.branchOrder.findMany({
    where: {
      tenantId: input.tenantId,
      branchId: { in: input.branchIds },
      status: { in: input.statuses },
      createdAt: { lt: cutoff },
    },
    orderBy: { createdAt: "asc" },
    take: REMINDER_LIMIT,
    select: { orderNumber: true, status: true, orderType: true, createdAt: true },
  });
  return rows.map((row) => ({
    orderNumber: row.orderNumber,
    status: row.status as ReminderStatus,
    statusLabel: BRANCH_ORDER_STATUS_LABELS[row.status],
    href: ORDER_TYPE_ROUTE[row.orderType],
    ageDays: Math.floor((input.now.getTime() - row.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
  }));
}

async function alreadyNotified(automationId: string, localDay: string) {
  const run = await prisma.aiAutomationRun.findFirst({
    where: {
      automationId,
      status: "succeeded",
      trigger: { in: ["schedule", "manual"] },
      result: { path: ["notifiedDay"], equals: localDay },
    },
    select: { id: true },
  });
  return run !== null;
}

async function notifyUser(input: {
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  href: string;
  createdById: string;
}) {
  await notificationRepository.create({
    tenantId: input.tenantId,
    audience: "USER",
    userId: input.userId,
    type: "pixelcare.pending_work_reminder",
    title: input.title,
    body: input.body,
    href: input.href,
    createdById: input.createdById,
  });
}

const defaultIo: ReminderIo = {
  loadAccess: loadOwnerAccess,
  findRecipients: findRecipientIds,
  findStaleOrders,
  alreadyNotified,
  notify: notifyUser,
};

export async function executePendingWorkReminder(
  ctx: AutomationExecutorContext,
  io: ReminderIo = defaultIo,
): Promise<Prisma.InputJsonObject> {
  const thresholds = parseReminderThresholds(ctx.thresholds);
  const access = await io.loadAccess(ctx.tenantId, ctx.ownerUserId);
  assertCanReadReminders(access);
  const branchIds = resolveScopedBranches(ctx.branchIds, access);
  const found = await io.findRecipients(ctx.tenantId, ctx.recipientUserIds);
  assertKnownRecipients(ctx.recipientUserIds, new Set(found));

  const now = new Date();
  const items = await io.findStaleOrders({
    tenantId: ctx.tenantId,
    branchIds,
    statuses: thresholds.statuses,
    olderThanDays: thresholds.olderThanDays,
    now,
  });
  const localDay = automationLocalDay(now, ctx.timezone);
  const decision = notificationDecision({
    trigger: ctx.trigger,
    alreadySentToday: items.length === 0 ? false : await io.alreadyNotified(ctx.automationId, localDay),
  });

  const summary =
    items.length === 0
      ? `No drafts or orders waiting for approval are older than ${thresholds.olderThanDays} days.`
      : `${items.length} ${items.length === 1 ? "order has" : "orders have"} been waiting more than ${thresholds.olderThanDays} days.`;

  const shouldNotify = decision.send && items.length > 0;
  if (shouldNotify) {
    const body = `${summary} ${items.map((item) => item.orderNumber).join(", ")}`;
    for (const userId of ctx.recipientUserIds) {
      await io.notify({
        tenantId: ctx.tenantId,
        userId,
        title: "Orders waiting for action",
        body,
        href: items[0]?.href ?? "/orders",
        createdById: ctx.ownerUserId,
      });
    }
  }

  const note = !decision.send
    ? decision.reason
    : items.length === 0
      ? "Nothing to remind. No notification was sent."
      : undefined;

  return {
    summary,
    olderThanDays: thresholds.olderThanDays,
    statuses: thresholds.statuses,
    items,
    notified: shouldNotify,
    ...(shouldNotify ? { notifiedDay: localDay } : {}),
    ...(note ? { note } : {}),
  };
}
