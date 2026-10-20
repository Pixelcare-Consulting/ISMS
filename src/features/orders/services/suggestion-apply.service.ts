import type { BranchOrderType, Prisma } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { branchQuotaService } from "@/features/branch-quotas/services/branch-quota.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { resolveActiveOrderPrice } from "@/features/master-data/utils/resolve-active-order-price";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import {
  additionalPlanningQty,
  decideAllocationEdit,
  decideApplyQuantity,
  NO_PLANNING_SUGGESTION_MESSAGE,
  NO_PLANOGRAM_MAX_MESSAGE,
  planningSuggestionChanged,
  publishedShelfGap,
  shelfSuggestionChanged,
  SPECIAL_NO_SUGGESTION_MESSAGE,
  suggestionLineFitsRemaining,
  submitAllocationMessage,
} from "@/features/orders/lib/suggestion-apply-decisions";
import {
  countStkByModel,
  draftLockKey,
  findOpenDraft,
  findReleasedPlanning,
  loadOutstandingByModel,
  lockKeysInOrder,
  lockSuggestionKey,
  nextDraftOrderNumber,
  planningLockKey,
  shelfLockKey,
  sumPlanningCoverage,
  suggestionDb,
  type OpenDraft,
  type SuggestionDb,
} from "@/features/orders/lib/suggestion-pool";
import { validateOrderLines } from "@/features/orders/services/order-line-validation";
import { assertOrderingAllowed } from "@/features/orders/utils/order-window";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";

const BRANCH_SCOPE_ERROR =
  "You can only create orders for branches in your area of responsibility.";

export type OrderSuggestionRow = {
  modelId: string;
  modelCode: string;
  description: string;
  sourceLabel: string;
  periodLabel: string | null;
  onHandQty: number | null;
  drop1Qty: number | null;
  stkQty: number | null;
  outstandingQty: number | null;
  suggestedQty: number | null;
  canSelect: boolean;
  sourceChanged: boolean;
  message: string | null;
};

export type OrderSuggestionList = {
  rows: OrderSuggestionRow[];
  message: string | null;
  hasOpenDraft: boolean;
  draftOrderId: string | null;
  draftOrderNumber: string | null;
};

export type ApplySuggestionResult = {
  orderId: string;
  orderNumber: string;
  createdDraft: boolean;
  applied: { modelId: string; modelCode: string; quantityAdded: number }[];
  reviews: { modelId: string; modelCode: string; message: string }[];
};

type Actor = {
  tenantId: string;
  userId: string;
  hasFullAccess: boolean;
};

type ApplyLine = { modelId: string; quantity: number };

type PoolSnapshot = {
  remaining: number;
  sourceQty: number;
  periodId: string | null;
  planningRunId: string | null;
};

async function assertBranchScope(actor: Actor, branchId: string): Promise<void> {
  if (actor.hasFullAccess) return;
  const branchIds = await getUserBranchIds(actor.tenantId, actor.userId);
  if (branchIds && !branchIds.includes(branchId)) {
    throw new Error(BRANCH_SCOPE_ERROR);
  }
}

async function assertCreateWindow(tenantId: string, branchId: string, orderType: BranchOrderType) {
  const [policy, scheduleCtx] = await Promise.all([
    orderingPolicyService.getPolicy(tenantId),
    branchRepository.findScheduleContext(tenantId, branchId),
  ]);
  assertOrderingAllowed({
    action: "create",
    orderType,
    policy,
    branchName: scheduleCtx?.name,
    schedule: scheduleCtx?.deliveryScheduleConfig
      ? { orderDays: scheduleCtx.deliveryScheduleConfig.orderDays }
      : null,
  });
}

async function lineAmounts(
  tenantId: string,
  lines: { modelId: string; quantity: number }[],
): Promise<Map<string, number>> {
  const sources = await masterDataRepository.listModelsForOrderPricing(
    tenantId,
    lines.map((line) => line.modelId),
  );
  const byId = new Map(sources.map((model) => [model.id, model]));
  const amounts = new Map<string, number>();
  for (const line of lines) {
    const model = byId.get(line.modelId);
    const price = model ? resolveActiveOrderPrice(model.priceLists, model.srp) : 0;
    amounts.set(line.modelId, line.quantity * price);
  }
  return amounts;
}

async function inventoryCodeId(tenantId: string, code: "STK" | "DIT"): Promise<string | null> {
  const row = await reasonStatusRepository.findCodeId(tenantId, "inventory_system", code);
  return row?.id ?? null;
}

function emptyList(message: string | null, draft: OpenDraft | null): OrderSuggestionList {
  return {
    rows: [],
    message,
    hasOpenDraft: Boolean(draft),
    draftOrderId: draft?.id ?? null,
    draftOrderNumber: draft?.orderNumber ?? null,
  };
}

function sourceKindFor(orderType: BranchOrderType): "planning_drop1" | "shelf_gap" | null {
  switch (orderType) {
    case "auto_replenish":
      return "planning_drop1";
    case "manual":
      return "shelf_gap";
    case "special":
      return null;
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}

async function listPlanningSuggestions(
  db: SuggestionDb,
  tenantId: string,
  branchId: string,
  draft: OpenDraft | null,
): Promise<OrderSuggestionList> {
  const released = await findReleasedPlanning(db, tenantId, branchId);
  if (!released) return emptyList(NO_PLANNING_SUGGESTION_MESSAGE, draft);

  const modelIds = released.lines.map((line) => line.modelId);
  const coverage = await sumPlanningCoverage(db, {
    tenantId,
    branchId,
    periodId: released.periodId,
    periodLabel: released.periodLabel,
    documentNumber: released.documentNumber,
    modelIds,
  });
  const draftByModel = new Map(draft?.details.map((detail) => [detail.modelId, detail]) ?? []);

  const rows: OrderSuggestionRow[] = released.lines.map((line) => {
    const covered = coverage.get(line.modelId) ?? { allocatedQty: 0, legacyUnallocatedQty: 0 };
    const suggestedQty = additionalPlanningQty({
      releasedDrop1Qty: line.releasedDrop1Qty,
      allocatedQty: covered.allocatedQty,
      legacyUnallocatedQty: covered.legacyUnallocatedQty,
    });
    const draftLine = draftByModel.get(line.modelId);
    return {
      modelId: line.modelId,
      modelCode: line.skuCode,
      description: line.description,
      sourceLabel: "Supply Planning Drop 1",
      periodLabel: released.periodLabel,
      onHandQty: line.onHandQty,
      drop1Qty: line.releasedDrop1Qty,
      stkQty: null,
      outstandingQty: null,
      suggestedQty,
      canSelect: suggestedQty > 0,
      sourceChanged: planningSuggestionChanged({
        sourceQty: draftLine?.suggestionAllocation?.sourceQty ?? null,
        releasedDrop1Qty: line.releasedDrop1Qty,
      }),
      message: null,
    };
  });

  return {
    rows,
    message: null,
    hasOpenDraft: Boolean(draft),
    draftOrderId: draft?.id ?? null,
    draftOrderNumber: draft?.orderNumber ?? null,
  };
}

async function listManualSuggestions(
  db: SuggestionDb,
  tenantId: string,
  branchId: string,
  draft: OpenDraft | null,
): Promise<OrderSuggestionList> {
  const planogram = await db.branchPlanogram.findMany({
    where: { tenantId, branchId },
    orderBy: { model: { skuCode: "asc" } },
    select: {
      modelId: true,
      maxQty: true,
      model: { select: { skuCode: true, name: true } },
    },
  });
  if (planogram.length === 0) return emptyList(NO_PLANOGRAM_MAX_MESSAGE, draft);

  const modelIds = planogram.map((row) => row.modelId);
  const [stkCodeId, ditCodeId] = await Promise.all([
    inventoryCodeId(tenantId, "STK"),
    inventoryCodeId(tenantId, "DIT"),
  ]);
  const [stkByModel, outstanding] = await Promise.all([
    countStkByModel(db, { tenantId, branchId, modelIds, stkCodeId }),
    loadOutstandingByModel(db, { tenantId, branchId, modelIds, stkCodeId, ditCodeId }),
  ]);
  const draftByModel = new Map(draft?.details.map((detail) => [detail.modelId, detail]) ?? []);

  const rows: OrderSuggestionRow[] = planogram.map((row) => {
    const shelfMax = row.maxQty ?? null;
    const stkQty = stkByModel.get(row.modelId) ?? 0;
    const outstandingQty = outstanding.get(row.modelId) ?? 0;
    const suggested = publishedShelfGap({ shelfMax, stkQty, outstandingQty });
    const draftLine = draftByModel.get(row.modelId);
    return {
      modelId: row.modelId,
      modelCode: row.model.skuCode,
      description: row.model.name,
      sourceLabel: "Shelf gap",
      periodLabel: null,
      onHandQty: null,
      drop1Qty: null,
      stkQty,
      outstandingQty: suggested == null ? null : outstandingQty,
      suggestedQty: suggested,
      canSelect: suggested != null && suggested > 0,
      sourceChanged: shelfSuggestionChanged({
        sourceQty: draftLine?.suggestionAllocation?.sourceQty ?? null,
        shelfMax,
        stkQty,
        outstandingExcludingLine: Math.max(0, outstandingQty - (draftLine?.quantity ?? 0)),
      }),
      message: suggested == null ? NO_PLANOGRAM_MAX_MESSAGE : null,
    };
  });

  return {
    rows,
    message: null,
    hasOpenDraft: Boolean(draft),
    draftOrderId: draft?.id ?? null,
    draftOrderNumber: draft?.orderNumber ?? null,
  };
}

async function poolSnapshot(
  db: SuggestionDb,
  input: {
    tenantId: string;
    branchId: string;
    modelId: string;
    sourceKind: "planning_drop1" | "shelf_gap";
    draftLineQty: number;
  },
): Promise<PoolSnapshot> {
  if (input.sourceKind === "planning_drop1") {
    const released = await findReleasedPlanning(db, input.tenantId, input.branchId);
    if (!released) throw new Error(NO_PLANNING_SUGGESTION_MESSAGE);
    const line = released.lines.find((row) => row.modelId === input.modelId);
    if (!line) throw new Error(NO_PLANNING_SUGGESTION_MESSAGE);
    const coverage = await sumPlanningCoverage(db, {
      tenantId: input.tenantId,
      branchId: input.branchId,
      periodId: released.periodId,
      periodLabel: released.periodLabel,
      documentNumber: released.documentNumber,
      modelIds: [input.modelId],
    });
    const covered = coverage.get(input.modelId) ?? { allocatedQty: 0, legacyUnallocatedQty: 0 };
    return {
      remaining: additionalPlanningQty({
        releasedDrop1Qty: line.releasedDrop1Qty,
        allocatedQty: covered.allocatedQty,
        legacyUnallocatedQty: covered.legacyUnallocatedQty,
      }),
      sourceQty: line.releasedDrop1Qty,
      periodId: released.periodId,
      planningRunId: released.runId,
    };
  }

  const planogram = await db.branchPlanogram.findFirst({
    where: { tenantId: input.tenantId, branchId: input.branchId, modelId: input.modelId },
    select: { maxQty: true },
  });
  const shelfMax = planogram?.maxQty ?? null;
  const [stkCodeId, ditCodeId] = await Promise.all([
    inventoryCodeId(input.tenantId, "STK"),
    inventoryCodeId(input.tenantId, "DIT"),
  ]);
  const [stkByModel, outstandingByModel] = await Promise.all([
    countStkByModel(db, {
      tenantId: input.tenantId,
      branchId: input.branchId,
      modelIds: [input.modelId],
      stkCodeId,
    }),
    loadOutstandingByModel(db, {
      tenantId: input.tenantId,
      branchId: input.branchId,
      modelIds: [input.modelId],
      stkCodeId,
      ditCodeId,
    }),
  ]);
  const stkQty = stkByModel.get(input.modelId) ?? 0;
  const outstandingQty = outstandingByModel.get(input.modelId) ?? 0;
  const remaining = publishedShelfGap({ shelfMax, stkQty, outstandingQty });
  if (remaining == null) throw new Error(NO_PLANOGRAM_MAX_MESSAGE);
  const sourceQty = publishedShelfGap({
    shelfMax,
    stkQty,
    outstandingQty: Math.max(0, outstandingQty - input.draftLineQty),
  });
  return {
    remaining,
    sourceQty: sourceQty ?? remaining,
    periodId: null,
    planningRunId: null,
  };
}

async function lockModelPools(
  db: SuggestionDb,
  input: {
    tenantId: string;
    branchId: string;
    orderType: BranchOrderType;
    modelIds: string[];
    sourceKind: "planning_drop1" | "shelf_gap";
  },
): Promise<void> {
  if (input.sourceKind === "planning_drop1") {
    const released = await findReleasedPlanning(db, input.tenantId, input.branchId);
    if (!released) throw new Error(NO_PLANNING_SUGGESTION_MESSAGE);
    await lockKeysInOrder(
      db,
      input.modelIds.map((modelId) =>
        planningLockKey({
          tenantId: input.tenantId,
          periodId: released.periodId,
          branchId: input.branchId,
          modelId,
          orderType: input.orderType,
        }),
      ),
    );
    return;
  }

  await lockKeysInOrder(
    db,
    input.modelIds.map((modelId) =>
      shelfLockKey({
        tenantId: input.tenantId,
        branchId: input.branchId,
        modelId,
        orderType: input.orderType,
      }),
    ),
  );
}

function allocationCreate(input: {
  tenantId: string;
  orderDetailId: string;
  branchId: string;
  modelId: string;
  orderType: BranchOrderType;
  sourceKind: "planning_drop1" | "shelf_gap";
  periodId: string | null;
  planningRunId: string | null;
  allocatedQty: number;
  sourceQty: number;
}) {
  return {
    tenantId: input.tenantId,
    orderDetailId: input.orderDetailId,
    branchId: input.branchId,
    modelId: input.modelId,
    orderType: input.orderType,
    sourceKind: input.sourceKind,
    periodId: input.periodId,
    planningRunId: input.planningRunId,
    allocatedQty: input.allocatedQty,
    sourceQty: input.sourceQty,
  };
}

function projectDraftLines(
  draft: OpenDraft | null,
  prepared: { modelId: string; quantityToAdd: number }[],
): { modelId: string; quantity: number }[] {
  const quantities = new Map<string, number>();
  for (const detail of draft?.details ?? []) quantities.set(detail.modelId, detail.quantity);
  for (const line of prepared) {
    quantities.set(line.modelId, (quantities.get(line.modelId) ?? 0) + line.quantityToAdd);
  }
  return [...quantities.entries()].map(([modelId, quantity]) => ({ modelId, quantity }));
}

export const suggestionApplyService = {
  async list(
    actor: Actor,
    input: { branchId: string; orderType: BranchOrderType },
  ): Promise<OrderSuggestionList> {
    await assertBranchScope(actor, input.branchId);
    const db = suggestionDb();
    const draft = await findOpenDraft(db, actor.tenantId, input.branchId, input.orderType);

    switch (input.orderType) {
      case "special":
        return emptyList(SPECIAL_NO_SUGGESTION_MESSAGE, draft);
      case "auto_replenish":
        return listPlanningSuggestions(db, actor.tenantId, input.branchId, draft);
      case "manual":
        return listManualSuggestions(db, actor.tenantId, input.branchId, draft);
      default: {
        const _exhaustive: never = input.orderType;
        return _exhaustive;
      }
    }
  },

  async apply(
    actor: Actor,
    input: { branchId: string; orderType: BranchOrderType; lines: ApplyLine[] },
  ): Promise<ApplySuggestionResult> {
    await assertBranchScope(actor, input.branchId);
    const sourceKind = sourceKindFor(input.orderType);
    if (!sourceKind) throw new Error(SPECIAL_NO_SUGGESTION_MESSAGE);
    if (input.lines.length === 0) throw new Error("Select at least one suggestion.");

    const seen = new Set<string>();
    for (const line of input.lines) {
      if (seen.has(line.modelId)) throw new Error("Each model can only be selected once.");
      seen.add(line.modelId);
    }

    await assertCreateWindow(actor.tenantId, input.branchId, input.orderType);
    await branchQuotaService.assertWithinQuota(actor.tenantId, input.branchId, input.lines);

    const result = await prisma.$transaction(async (tx) => {
      const db = suggestionDb(tx);
      await lockSuggestionKey(db, draftLockKey(actor.tenantId, input.branchId, input.orderType));
      await lockModelPools(db, {
        tenantId: actor.tenantId,
        branchId: input.branchId,
        orderType: input.orderType,
        modelIds: input.lines.map((line) => line.modelId),
        sourceKind,
      });

      const draft = await findOpenDraft(db, actor.tenantId, input.branchId, input.orderType);
      const draftByModel = new Map(draft?.details.map((detail) => [detail.modelId, detail]) ?? []);
      const prepared: {
        modelId: string;
        modelCode: string;
        quantityToAdd: number;
        nextAllocatedQty: number;
        sourceQty: number;
        periodId: string | null;
        planningRunId: string | null;
        existingDetailId: string | null;
      }[] = [];
      const reviews: ApplySuggestionResult["reviews"] = [];

      for (const line of input.lines) {
        const existing = draftByModel.get(line.modelId);
        const pool = await poolSnapshot(db, {
          tenantId: actor.tenantId,
          branchId: input.branchId,
          modelId: line.modelId,
          sourceKind,
          draftLineQty: existing?.quantity ?? 0,
        });
        const decision = decideApplyQuantity({
          requestedQty: line.quantity,
          remaining: pool.remaining,
          existing: existing?.suggestionAllocation
            ? {
                lineQty: existing.quantity,
                allocatedQty: existing.suggestionAllocation.allocatedQty,
              }
            : null,
        });
        const model = await tx.productModel.findFirst({
          where: { id: line.modelId, tenantId: actor.tenantId },
          select: { skuCode: true },
        });
        const modelCode = model?.skuCode ?? line.modelId;

        if (decision.kind === "reject") {
          throw new Error(
            decision.message.startsWith("Quantity exceeds")
              ? `Quantity for ${modelCode} exceeds the remaining suggestion (${pool.remaining}).`
              : decision.message,
          );
        }
        if (decision.kind === "review") {
          reviews.push({ modelId: line.modelId, modelCode, message: decision.message });
          continue;
        }

        prepared.push({
          modelId: line.modelId,
          modelCode,
          quantityToAdd: decision.quantityToAdd,
          nextAllocatedQty: existing?.suggestionAllocation
            ? decision.nextAllocatedQty
            : decision.quantityToAdd,
          sourceQty: pool.sourceQty,
          periodId: pool.periodId,
          planningRunId: pool.planningRunId,
          existingDetailId: existing?.id ?? null,
        });
      }

      if (prepared.length === 0) {
        if (!draft) throw new Error("Select at least one suggestion.");
        return {
          orderId: draft.id,
          orderNumber: draft.orderNumber,
          createdDraft: false,
          applied: [],
          reviews,
        } satisfies ApplySuggestionResult;
      }

      const projected = projectDraftLines(draft, prepared);
      await validateOrderLines(actor.tenantId, input.branchId, input.orderType, projected);
      const amounts = await lineAmounts(actor.tenantId, projected);

      let orderId = draft?.id ?? "";
      let orderNumber = draft?.orderNumber ?? "";
      let createdDraft = false;

      if (!draft) {
        orderNumber = await nextDraftOrderNumber(db, actor.tenantId);
        const created = await tx.branchOrder.create({
          data: {
            tenantId: actor.tenantId,
            branchId: input.branchId,
            orderType: input.orderType,
            status: "draft",
            orderNumber,
            createdById: actor.userId,
            notes: "Created from Suggested Orders",
            details: {
              create: prepared.map((line) => ({
                modelId: line.modelId,
                quantity: line.quantityToAdd,
                amount: amounts.get(line.modelId) ?? 0,
              })),
            },
          },
          select: {
            id: true,
            orderNumber: true,
            details: { select: { id: true, modelId: true } },
          },
        });
        orderId = created.id;
        createdDraft = true;
        const detailIdByModel = new Map(created.details.map((detail) => [detail.modelId, detail.id]));
        for (const line of prepared) {
          const orderDetailId = detailIdByModel.get(line.modelId);
          if (!orderDetailId) throw new Error("Could not save the suggested line.");
          await tx.orderSuggestionAllocation.create({
            data: allocationCreate({
              tenantId: actor.tenantId,
              orderDetailId,
              branchId: input.branchId,
              modelId: line.modelId,
              orderType: input.orderType,
              sourceKind,
              periodId: line.periodId,
              planningRunId: line.planningRunId,
              allocatedQty: line.nextAllocatedQty,
              sourceQty: line.sourceQty,
            }),
          });
        }
      } else {
        for (const line of prepared) {
          const amount = amounts.get(line.modelId) ?? 0;
          if (line.existingDetailId) {
            const current = draftByModel.get(line.modelId);
            await tx.branchOrderDetail.update({
              where: { id: line.existingDetailId },
              data: {
                quantity: (current?.quantity ?? 0) + line.quantityToAdd,
                amount,
              },
            });
            if (current?.suggestionAllocation) {
              await tx.orderSuggestionAllocation.update({
                where: { orderDetailId: line.existingDetailId },
                data: { allocatedQty: line.nextAllocatedQty, sourceQty: line.sourceQty },
              });
            } else {
              await tx.orderSuggestionAllocation.create({
                data: allocationCreate({
                  tenantId: actor.tenantId,
                  orderDetailId: line.existingDetailId,
                  branchId: input.branchId,
                  modelId: line.modelId,
                  orderType: input.orderType,
                  sourceKind,
                  periodId: line.periodId,
                  planningRunId: line.planningRunId,
                  allocatedQty: line.nextAllocatedQty,
                  sourceQty: line.sourceQty,
                }),
              });
            }
          } else {
            const created = await tx.branchOrderDetail.create({
              data: {
                orderId: draft.id,
                modelId: line.modelId,
                quantity: line.quantityToAdd,
                amount,
              },
              select: { id: true },
            });
            await tx.orderSuggestionAllocation.create({
              data: allocationCreate({
                tenantId: actor.tenantId,
                orderDetailId: created.id,
                branchId: input.branchId,
                modelId: line.modelId,
                orderType: input.orderType,
                sourceKind,
                periodId: line.periodId,
                planningRunId: line.planningRunId,
                allocatedQty: line.nextAllocatedQty,
                sourceQty: line.sourceQty,
              }),
            });
          }
        }
      }

      return {
        orderId,
        orderNumber,
        createdDraft,
        applied: prepared.map((line) => ({
          modelId: line.modelId,
          modelCode: line.modelCode,
          quantityAdded: line.quantityToAdd,
        })),
        reviews,
      } satisfies ApplySuggestionResult;
    });

    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "order.suggestion_applied",
      entityType: "BranchOrder",
      entityId: result.orderId,
      metadata: {
        orderNumber: result.orderNumber,
        orderType: input.orderType,
        createdDraft: result.createdDraft,
        applied: result.applied,
        reviews: result.reviews,
        status: "draft",
      },
    });

    return result;
  },

  async allocationEditsForLineChange(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      orderId: string;
      branchId: string;
      orderType: BranchOrderType;
      nextLines: { modelId: string; quantity: number }[];
    },
  ): Promise<Record<string, number>> {
    const sourceKind = sourceKindFor(input.orderType);
    if (!sourceKind) return {};

    const details = await tx.branchOrderDetail.findMany({
      where: { orderId: input.orderId },
      select: {
        id: true,
        modelId: true,
        quantity: true,
        suggestionAllocation: { select: { allocatedQty: true, sourceKind: true } },
        model: { select: { skuCode: true } },
      },
    });
    const nextByModel = new Map(input.nextLines.map((line) => [line.modelId, line.quantity]));
    const tracked = details.filter(
      (detail) => detail.suggestionAllocation && nextByModel.has(detail.modelId),
    );
    if (tracked.length === 0) return {};

    const db = suggestionDb(tx);
    await lockModelPools(db, {
      tenantId: input.tenantId,
      branchId: input.branchId,
      orderType: input.orderType,
      modelIds: tracked.map((detail) => detail.modelId),
      sourceKind,
    });

    const updates: Record<string, number> = {};
    for (const detail of tracked) {
      const allocation = detail.suggestionAllocation;
      if (!allocation) continue;
      const nextQty = nextByModel.get(detail.modelId);
      if (nextQty == null) continue;
      const kind = allocation.sourceKind === "shelf_gap" ? "shelf_gap" : "planning_drop1";
      const pool = await poolSnapshot(db, {
        tenantId: input.tenantId,
        branchId: input.branchId,
        modelId: detail.modelId,
        sourceKind: kind,
        draftLineQty: detail.quantity,
      });
      const decision = decideAllocationEdit({
        nextQty,
        allocatedQty: allocation.allocatedQty,
        remaining: pool.remaining,
        skuCode: detail.model.skuCode,
      });
      if (!decision.ok) throw new Error(decision.message);
      updates[detail.id] = decision.allocatedQty;
    }
    return updates;
  },

  async assertSubmittable(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      branchId: string;
      orderType: BranchOrderType;
      details: { id: string; modelId: string; quantity: number; skuCode: string }[];
    },
  ): Promise<void> {
    const sourceKind = sourceKindFor(input.orderType);
    if (!sourceKind || input.details.length === 0) return;

    const allocations = await tx.orderSuggestionAllocation.findMany({
      where: { orderDetailId: { in: input.details.map((detail) => detail.id) } },
      select: { orderDetailId: true, modelId: true, allocatedQty: true, sourceKind: true },
    });
    if (allocations.length === 0) return;

    const byDetail = new Map(allocations.map((row) => [row.orderDetailId, row]));
    const tracked = input.details.filter((detail) => byDetail.has(detail.id));
    const db = suggestionDb(tx);
    await lockModelPools(db, {
      tenantId: input.tenantId,
      branchId: input.branchId,
      orderType: input.orderType,
      modelIds: tracked.map((detail) => detail.modelId),
      sourceKind,
    });

    for (const detail of tracked) {
      const allocation = byDetail.get(detail.id);
      if (!allocation) continue;
      const kind = allocation.sourceKind === "shelf_gap" ? "shelf_gap" : "planning_drop1";
      const pool = await poolSnapshot(db, {
        tenantId: input.tenantId,
        branchId: input.branchId,
        modelId: detail.modelId,
        sourceKind: kind,
        draftLineQty: detail.quantity,
      });
      if (
        !suggestionLineFitsRemaining({
          lineQty: detail.quantity,
          allocatedQty: allocation.allocatedQty,
          remaining: pool.remaining,
        })
      ) {
        throw new Error(
          submitAllocationMessage(detail.skuCode, pool.remaining + allocation.allocatedQty),
        );
      }
    }
  },
};
