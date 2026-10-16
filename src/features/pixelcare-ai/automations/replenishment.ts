import type { Prisma } from "@/lib/database/generated/prisma/client";

import type { AutomationExecutorContext } from "@/features/pixelcare-ai/automations/executors";
import {
  assertCanCreateReplenishment,
  loadOwnerAccess,
  resolveScopedBranches,
  type OwnerAccess,
} from "@/features/pixelcare-ai/automations/owner-access";
import {
  automationLocalDay,
  buildReplenishmentLines,
  confirmOpenProposal,
  isUniqueConflict,
  localDayToDate,
  orderableReplenishmentLines,
  PROPOSED_NOT_CREATED,
  readMinSug,
  REPLENISHMENT_ANALYTICS_HREF,
  REPLENISHMENT_ORDER_TYPE,
  type ReplenishmentLine,
} from "@/features/pixelcare-ai/automations/proposal-lines";
import { hashOrderableLines } from "@/features/pixelcare-ai/automations/line-hash";
import { orderAnalyticsService } from "@/features/orders/services/order-analytics.service";
import { orderService } from "@/features/orders/services/order.service";
import { ORDER_TYPE_ROUTE } from "@/features/orders/constants/order-permissions";
import { prisma } from "@/lib/database/client";

const MAX_PROPOSAL_LINES = 200;

export type BranchProposalDraft = {
  branchId: string;
  branchName: string;
  lines: ReplenishmentLine[];
  exceptions: string[];
  href: string;
};

export type SavedProposal = { id: string; reused: boolean };

type ReplenishmentIo = {
  loadAccess: (tenantId: string, userId: string) => Promise<OwnerAccess>;
  readBranch: (input: {
    tenantId: string;
    branchId: string;
    minSug: number;
  }) => Promise<BranchProposalDraft>;
  saveProposal: (input: {
    tenantId: string;
    runId: string;
    branchId: string;
    localDay: string;
    lines: ReplenishmentLine[];
  }) => Promise<SavedProposal>;
};

async function readBranchProposal(input: {
  tenantId: string;
  branchId: string;
  minSug: number;
}): Promise<BranchProposalDraft> {
  const workspace = await orderAnalyticsService.getWorkspace(input.tenantId, {
    branchId: input.branchId,
    brandId: null,
    orderType: REPLENISHMENT_ORDER_TYPE,
  });
  const modelIds = workspace.lines.map((line) => line.modelId);
  const models =
    modelIds.length === 0
      ? []
      : await prisma.productModel.findMany({
          where: { tenantId: input.tenantId, id: { in: modelIds } },
          select: { id: true, status: true },
        });
  const statusById = new Map(models.map((model) => [model.id, model.status]));
  const lines = buildReplenishmentLines(
    workspace.lines.map((line) => ({
      modelId: line.modelId,
      sku: line.skuCode,
      shelfMax: line.maxQty,
      stk: line.stkQty,
      modelStatus: statusById.get(line.modelId) ?? "active",
    })),
    input.minSug,
  );
  const exceptions: string[] = [];
  if (workspace.windowBlocked && workspace.windowReason) {
    exceptions.push(workspace.windowReason);
  }
  const capped = lines.slice(0, MAX_PROPOSAL_LINES);
  if (lines.length > capped.length) {
    exceptions.push(`Showing the first ${MAX_PROPOSAL_LINES} shelf gaps.`);
  }
  return {
    branchId: workspace.branchId,
    branchName: workspace.branchName,
    lines: capped,
    exceptions,
    href: REPLENISHMENT_ANALYTICS_HREF,
  };
}

async function saveOpenProposal(input: {
  tenantId: string;
  runId: string;
  branchId: string;
  localDay: string;
  lines: ReplenishmentLine[];
}): Promise<SavedProposal> {
  const localDay = localDayToDate(input.localDay);
  try {
    const created = await prisma.aiReplenishmentProposal.create({
      data: {
        tenantId: input.tenantId,
        runId: input.runId,
        branchId: input.branchId,
        localDay,
        lines: input.lines,
        lineHash: hashOrderableLines(input.lines),
        status: "proposed",
        orderId: null,
      },
      select: { id: true },
    });
    return { id: created.id, reused: false };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const existing = await prisma.aiReplenishmentProposal.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        localDay,
        status: "proposed",
      },
      select: { id: true, lineHash: true, lines: true },
    });
    if (!existing) throw error;
    if (!existing.lineHash) {
      try {
        const lineHash = hashOrderableLines(parseStoredProposalLines(existing.lines));
        await prisma.aiReplenishmentProposal.update({
          where: { id: existing.id },
          data: { lineHash },
        });
      } catch {
        // Confirm stays disabled until the stored lines can be hashed.
      }
    }
    return { id: existing.id, reused: true };
  }
}

const defaultIo: ReplenishmentIo = {
  loadAccess: loadOwnerAccess,
  readBranch: readBranchProposal,
  saveProposal: saveOpenProposal,
};

function proposalResult(input: {
  proposalId: string | null;
  reused: boolean;
  draft: BranchProposalDraft;
}): Prisma.InputJsonObject {
  return {
    proposalId: input.proposalId,
    reused: input.reused,
    branchId: input.draft.branchId,
    branchName: input.draft.branchName,
    lines: input.draft.lines,
    exceptions: input.draft.exceptions,
    href: input.draft.href,
    label: PROPOSED_NOT_CREATED,
    orderCreated: false,
  };
}

/**
 * Preview, Run now, and scheduled runs save a proposal only.
 * They never call `orderService.create`.
 */
export async function executeReplenishmentReview(
  ctx: AutomationExecutorContext,
  io: ReplenishmentIo = defaultIo,
): Promise<Prisma.InputJsonObject> {
  const access = await io.loadAccess(ctx.tenantId, ctx.ownerUserId);
  assertCanCreateReplenishment(access);
  const branchIds = resolveScopedBranches(ctx.branchIds, access);
  const minSug = readMinSug(ctx.thresholds);
  const localDay = automationLocalDay(new Date(), ctx.timezone);
  const proposals: Prisma.InputJsonObject[] = [];

  for (const branchId of branchIds) {
    const draft = await io.readBranch({ tenantId: ctx.tenantId, branchId, minSug });
    const saved = await io.saveProposal({
      tenantId: ctx.tenantId,
      runId: ctx.runId,
      branchId,
      localDay,
      lines: draft.lines,
    });
    proposals.push(proposalResult({ proposalId: saved.id, reused: saved.reused, draft }));
  }

  return {
    label: PROPOSED_NOT_CREATED,
    orderCreated: false,
    proposals,
  };
}

type StoredProposal = {
  id: string;
  tenantId: string;
  branchId: string;
  status: "proposed" | "confirmed" | "superseded";
  orderId: string | null;
  lines: Prisma.JsonValue;
  run: { automation: { ownerUserId: string } };
};

export function parseStoredProposalLines(value: Prisma.JsonValue): ReplenishmentLine[] {
  if (!Array.isArray(value)) throw new Error("Proposal lines are missing.");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Proposal lines are missing.");
    }
    const line = entry as Record<string, unknown>;
    const sku = line.sku;
    const modelId = line.modelId;
    const shelfMax = line.shelfMax;
    const stk = line.stk;
    const sug = line.sug;
    const exceptions = line.exceptions;
    if (
      typeof sku !== "string" ||
      typeof modelId !== "string" ||
      typeof shelfMax !== "number" ||
      typeof stk !== "number" ||
      typeof sug !== "number" ||
      !Array.isArray(exceptions)
    ) {
      throw new Error("Proposal lines are missing.");
    }
    return {
      sku,
      modelId,
      shelfMax,
      stk,
      sug,
      exceptions: exceptions.filter((item): item is string => typeof item === "string"),
    };
  });
}

export type ConfirmProposalResult = {
  created: boolean;
  orderId: string;
  orderNumber: string | null;
  status: string | null;
  href: string;
  label: string;
};

/**
 * Creates one auto-replenish order through `orderService.create` when the
 * proposal is still proposed and has no order. A retry returns that order.
 */
/** Chat tool: propose for one branch the owner can access. Does not create an order. */
export async function prepareReplenishmentProposalForUser(input: {
  tenantId: string;
  userId: string;
  branchId: string;
}): Promise<Prisma.InputJsonObject> {
  const automation = await prisma.aiAutomation.findFirst({
    where: {
      tenantId: input.tenantId,
      ownerUserId: input.userId,
      template: "replenishment_review",
    },
  });
  const owned =
    automation ??
    (await prisma.aiAutomation.create({
      data: {
        tenantId: input.tenantId,
        ownerUserId: input.userId,
        template: "replenishment_review",
        enabled: false,
        timezone: "Asia/Manila",
        timeOfDayMinutes: 8 * 60,
        weekdays: [1, 2, 3, 4, 5],
        thresholds: { minSug: 1 },
        branchIds: [],
        recipientUserIds: [],
      },
    }));

  const now = new Date();
  const run = await prisma.aiAutomationRun.create({
    data: {
      tenantId: input.tenantId,
      automationId: owned.id,
      trigger: "manual",
      actorUserId: input.userId,
      status: "running",
      slot: `prepare:${now.toISOString()}`,
    },
    select: { id: true },
  });

  try {
    const result = await executeReplenishmentReview({
      automationId: owned.id,
      tenantId: owned.tenantId,
      ownerUserId: owned.ownerUserId,
      template: "replenishment_review",
      timezone: owned.timezone,
      timeOfDayMinutes: owned.timeOfDayMinutes,
      weekdays: owned.weekdays,
      branchIds: [input.branchId],
      thresholds: owned.thresholds,
      recipientUserIds: owned.recipientUserIds,
      runId: run.id,
      slot: `prepare:${now.toISOString()}`,
      trigger: "manual",
    });
    await prisma.aiAutomationRun.update({
      where: { id: run.id },
      data: { status: "succeeded", result, finishedAt: new Date() },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare a proposal.";
    await prisma.aiAutomationRun.update({
      where: { id: run.id },
      data: { status: "failed", error: message, finishedAt: new Date() },
    });
    throw error;
  }
}

export async function confirmReplenishmentProposal(input: {
  tenantId: string;
  actorUserId: string;
  proposalId: string;
}): Promise<ConfirmProposalResult> {
  const existing = await prisma.aiReplenishmentProposal.findFirst({
    where: { id: input.proposalId, tenantId: input.tenantId },
    select: {
      id: true,
      tenantId: true,
      branchId: true,
      status: true,
      orderId: true,
      lines: true,
      run: { select: { automation: { select: { ownerUserId: true } } } },
    },
  });
  if (!existing) throw new Error("Proposal not found.");
  if (existing.run.automation.ownerUserId !== input.actorUserId) {
    throw new Error("Only the automation owner can confirm this proposal.");
  }

  const outcome = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM ai_replenishment_proposals WHERE id = ${input.proposalId} AND tenant_id = ${input.tenantId} FOR UPDATE`;
      const locked = await tx.aiReplenishmentProposal.findFirst({
        where: { id: input.proposalId, tenantId: input.tenantId },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          status: true,
          orderId: true,
          lines: true,
          run: { select: { automation: { select: { ownerUserId: true } } } },
        },
      });
      return confirmLockedProposal(locked, input.actorUserId, tx);
    },
    { timeout: 20_000 },
  );

  const order = await prisma.branchOrder.findFirst({
    where: { id: outcome.orderId, tenantId: input.tenantId },
    select: { id: true, orderNumber: true, status: true },
  });
  return {
    created: outcome.kind === "created",
    orderId: outcome.orderId,
    orderNumber: order?.orderNumber ?? null,
    status: order?.status ?? null,
    href: ORDER_TYPE_ROUTE[REPLENISHMENT_ORDER_TYPE],
    label: outcome.kind === "created" ? "Order created" : "Existing order",
  };
}

async function confirmLockedProposal(
  locked: StoredProposal | null,
  actorUserId: string,
  tx: Prisma.TransactionClient,
) {
  return confirmOpenProposal(
    locked ? { status: locked.status, orderId: locked.orderId } : null,
    {
      assertMayConfirm: async () => {
        if (!locked) throw new Error("Proposal not found.");
        const access = await loadOwnerAccess(locked.tenantId, actorUserId);
        assertCanCreateReplenishment(access);
        resolveScopedBranches([locked.branchId], access);
        const lines = orderableReplenishmentLines(parseStoredProposalLines(locked.lines));
        if (lines.length === 0) {
          throw new Error("No orderable shelf gaps on this proposal.");
        }
      },
      createDraft: async () => {
        if (!locked) throw new Error("Proposal not found.");
        const access = await loadOwnerAccess(locked.tenantId, actorUserId);
        const orderable = orderableReplenishmentLines(parseStoredProposalLines(locked.lines));
        const order = await orderService.create(locked.tenantId, actorUserId, {
          branchId: locked.branchId,
          orderType: REPLENISHMENT_ORDER_TYPE,
          notes: `Pixelcare replenishment proposal ${locked.id}`,
          brandId: null,
          hasFullAccess: access.fullOrderAccess,
          details: orderable.map((line) => ({
            modelId: line.modelId,
            quantity: line.sug,
            remarks: "Shelf max − STK",
          })),
        });
        return { id: order.id };
      },
      reread: async () => {
        const again = await tx.aiReplenishmentProposal.findFirst({
          where: { id: locked?.id ?? "", tenantId: locked?.tenantId ?? "" },
          select: { status: true, orderId: true },
        });
        if (!again) return null;
        return { status: again.status, orderId: again.orderId };
      },
      attach: async (orderId: string) => {
        if (!locked) return false;
        const updated = await tx.aiReplenishmentProposal.updateMany({
          where: {
            id: locked.id,
            tenantId: locked.tenantId,
            status: "proposed",
            orderId: null,
          },
          data: {
            status: "confirmed",
            orderId,
            confirmedById: actorUserId,
            confirmedAt: new Date(),
          },
        });
        return updated.count === 1;
      },
    },
  );
}
