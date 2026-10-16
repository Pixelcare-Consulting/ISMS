import type { Prisma } from "@/lib/database/generated/prisma/client";

import type { AutomationExecutorContext } from "@/features/pixelcare-ai/automations/executors";
import {
  assertCanReadBriefing,
  loadOwnerAccess,
  resolveScopedBranches,
  type OwnerAccess,
} from "@/features/pixelcare-ai/automations/owner-access";
import {
  assertKnownRecipients,
  automationLocalDay,
  buildReplenishmentLines,
  notificationDecision,
  REPLENISHMENT_ANALYTICS_HREF,
  REPLENISHMENT_ORDER_TYPE,
} from "@/features/pixelcare-ai/automations/proposal-lines";
import { ORDER_QUEUE_STATUSES } from "@/features/orders/constants/order-workflow";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import { ORDER_TYPE_ROUTE } from "@/features/orders/constants/order-permissions";
import { orderAnalyticsService } from "@/features/orders/services/order-analytics.service";
import { notificationRepository } from "@/features/notifications/repositories/notification.repository";
import { prisma } from "@/lib/database/client";

const PENDING_LIMIT = 8;

type BriefingIo = {
  loadAccess: (tenantId: string, userId: string) => Promise<OwnerAccess>;
  readShelfGaps: (tenantId: string, branchId: string) => Promise<{
    branchName: string;
    lineCount: number;
    totalSug: number;
  }>;
  readPending: (tenantId: string, branchIds: string[]) => Promise<{
    total: number;
    items: Array<{ orderNumber: string; statusLabel: string; href: string }>;
  }>;
  findRecipients: (tenantId: string, userIds: string[]) => Promise<string[]>;
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

async function readShelfGaps(tenantId: string, branchId: string) {
  const workspace = await orderAnalyticsService.getWorkspace(tenantId, {
    branchId,
    brandId: null,
    orderType: REPLENISHMENT_ORDER_TYPE,
  });
  const lines = buildReplenishmentLines(
    workspace.lines.map((line) => ({
      modelId: line.modelId,
      sku: line.skuCode,
      shelfMax: line.maxQty,
      stk: line.stkQty,
    })),
  ).filter((line) => line.exceptions.length === 0 && line.sug > 0);
  return {
    branchName: workspace.branchName,
    lineCount: lines.length,
    totalSug: lines.reduce((sum, line) => sum + line.sug, 0),
  };
}

async function readPending(tenantId: string, branchIds: string[]) {
  const where = {
    tenantId,
    branchId: { in: branchIds },
    status: { in: [...ORDER_QUEUE_STATUSES] },
  };
  const [total, rows] = await Promise.all([
    prisma.branchOrder.count({ where }),
    prisma.branchOrder.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: PENDING_LIMIT,
      select: { orderNumber: true, status: true, orderType: true },
    }),
  ]);
  return {
    total,
    items: rows.map((row) => ({
      orderNumber: row.orderNumber,
      statusLabel: BRANCH_ORDER_STATUS_LABELS[row.status],
      href: ORDER_TYPE_ROUTE[row.orderType],
    })),
  };
}

async function findRecipientIds(tenantId: string, userIds: string[]) {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { tenantId, deletedAt: null, id: { in: userIds } },
    select: { id: true },
  });
  return users.map((user) => user.id);
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
    type: "pixelcare.daily_briefing",
    title: input.title,
    body: input.body,
    href: input.href,
    createdById: input.createdById,
  });
}

const defaultIo: BriefingIo = {
  loadAccess: loadOwnerAccess,
  readShelfGaps,
  readPending,
  findRecipients: findRecipientIds,
  alreadyNotified,
  notify: notifyUser,
};

export async function executeDailyBriefing(
  ctx: AutomationExecutorContext,
  io: BriefingIo = defaultIo,
): Promise<Prisma.InputJsonObject> {
  const access = await io.loadAccess(ctx.tenantId, ctx.ownerUserId);
  assertCanReadBriefing(access);
  const branchIds = resolveScopedBranches(ctx.branchIds, access);
  const found = await io.findRecipients(ctx.tenantId, ctx.recipientUserIds);
  assertKnownRecipients(ctx.recipientUserIds, new Set(found));

  const gaps = [];
  for (const branchId of branchIds) {
    const gap = await io.readShelfGaps(ctx.tenantId, branchId);
    gaps.push({ branchId, ...gap, href: REPLENISHMENT_ANALYTICS_HREF });
  }
  const pending = await io.readPending(ctx.tenantId, branchIds);
  const totalSug = gaps.reduce((sum, gap) => sum + gap.totalSug, 0);
  const summary = `Shelf gaps: ${totalSug} units across ${gaps.length} ${gaps.length === 1 ? "branch" : "branches"}. Pending work: ${pending.total} ${pending.total === 1 ? "order" : "orders"}.`;
  const localDay = automationLocalDay(new Date(), ctx.timezone);
  const decision = notificationDecision({
    trigger: ctx.trigger,
    alreadySentToday: await io.alreadyNotified(ctx.automationId, localDay),
  });

  if (decision.send) {
    for (const userId of ctx.recipientUserIds) {
      await io.notify({
        tenantId: ctx.tenantId,
        userId,
        title: "Daily branch briefing",
        body: summary,
        href: "/internal/ai/automations",
        createdById: ctx.ownerUserId,
      });
    }
  }

  return {
    summary,
    shelfGaps: gaps,
    pendingWork: pending.items,
    pendingTotal: pending.total,
    notified: decision.send,
    ...(decision.send ? { notifiedDay: localDay } : { note: decision.reason }),
  };
}
