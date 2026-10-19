jest.mock("@/lib/database/client", () => ({
  prisma: {
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    planningPeriod: { findFirst: jest.fn() },
    demandPlanningRun: { findFirst: jest.fn() },
    demandPlanningLine: { findMany: jest.fn() },
    orderSuggestionAllocation: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    branchOrder: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    branchOrderDetail: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    branchPlanogram: { findMany: jest.fn(), findFirst: jest.fn() },
    branchInventory: { findMany: jest.fn() },
    productModel: { findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/aor/scope", () => ({
  getUserBranchIds: jest.fn(),
}));

jest.mock("@/features/ordering/services/ordering-policy.service", () => ({
  orderingPolicyService: { getPolicy: jest.fn() },
}));

jest.mock("@/features/branches/repositories/branch.repository", () => ({
  branchRepository: { findScheduleContext: jest.fn() },
}));

jest.mock("@/features/branch-quotas/services/branch-quota.service", () => ({
  branchQuotaService: { assertWithinQuota: jest.fn() },
}));

jest.mock("@/features/master-data/repositories/master-data.repository", () => ({
  masterDataRepository: {
    findModel: jest.fn(),
    listModelsForOrderPricing: jest.fn(),
  },
}));

jest.mock("@/features/planogram/repositories/planogram.repository", () => ({
  planogramRepository: {
    findPlanogramEntry: jest.fn(),
    countStockForModel: jest.fn(),
  },
}));

jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));

jest.mock("@/features/reason-status/repositories/reason-status.repository", () => ({
  reasonStatusRepository: { findCodeId: jest.fn() },
}));

jest.mock("@/features/orders/services/order.service", () => ({
  orderService: { submitDraft: jest.fn() },
}));

import { orderService } from "@/features/orders/services/order.service";
import { suggestionApplyService } from "@/features/orders/services/suggestion-apply.service";
import {
  NO_PLANNING_SUGGESTION_MESSAGE,
  NO_PLANOGRAM_MAX_MESSAGE,
  SPECIAL_NO_SUGGESTION_MESSAGE,
} from "@/features/orders/lib/suggestion-apply-decisions";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { auditService } from "@/features/audit/services/audit.service";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";

const actor = { tenantId: "tenant-1", userId: "user-1", hasFullAccess: false };

type DraftDetail = {
  id: string;
  modelId: string;
  quantity: number;
  suggestionAllocation: {
    allocatedQty: number;
    sourceQty: number;
    sourceKind: string;
  } | null;
};

type DraftState = {
  id: string;
  orderNumber: string;
  details: DraftDetail[];
} | null;

const state: {
  releasedByModel: Map<string, number>;
  allocatedByModel: Map<string, number>;
  draft: DraftState;
} = {
  releasedByModel: new Map(),
  allocatedByModel: new Map(),
  draft: null,
};

function resetPlanning(released: Record<string, number>) {
  state.releasedByModel = new Map(Object.entries(released));
  state.allocatedByModel = new Map();
  state.draft = null;
}

function planningLines() {
  return [...state.releasedByModel.entries()].map(([modelId, releasedDrop1Qty]) => ({
    modelId,
    skuCode: modelId === "model-1" ? "SKU-1" : "SKU-2",
    onHandQty: 4,
    releasedDrop1Qty,
    model: {
      name: modelId === "model-1" ? "Widget" : "Gadget",
      skuCode: modelId === "model-1" ? "SKU-1" : "SKU-2",
    },
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetPlanning({ "model-1": 5 });
  (getUserBranchIds as jest.Mock).mockResolvedValue(["branch-1"]);
  (orderingPolicyService.getPolicy as jest.Mock).mockResolvedValue({
    globalLockedWeekdays: [],
    lockAppliesToOrderTypes: ["manual", "special", "auto_replenish"],
    dailyLockEnabled: false,
  });
  (branchRepository.findScheduleContext as jest.Mock).mockResolvedValue({
    name: "Branch",
    deliveryScheduleConfig: null,
  });
  (masterDataRepository.findModel as jest.Mock).mockResolvedValue({
    id: "model-1",
    skuCode: "SKU-1",
    status: "active",
  });
  (masterDataRepository.listModelsForOrderPricing as jest.Mock).mockResolvedValue([
    { id: "model-1", srp: 0, priceLists: [] },
    { id: "model-2", srp: 0, priceLists: [] },
  ]);
  (planogramRepository.findPlanogramEntry as jest.Mock).mockResolvedValue({ maxQty: 20 });
  (planogramRepository.countStockForModel as jest.Mock).mockResolvedValue(0);
  (auditService.log as jest.Mock).mockResolvedValue(undefined);
  (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
    fn(prisma),
  );
  (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);
  (prisma.planningPeriod.findFirst as jest.Mock).mockResolvedValue({
    id: "period-1",
    label: "Oct 2026",
  });
  (prisma.demandPlanningRun.findFirst as jest.Mock).mockResolvedValue({
    id: "run-1",
    documentNumber: "SP-202610-001",
  });
  (prisma.demandPlanningLine.findMany as jest.Mock).mockImplementation(async () => planningLines());
  (prisma.orderSuggestionAllocation.findMany as jest.Mock).mockImplementation(async () =>
    [...state.allocatedByModel.entries()].map(([modelId, allocatedQty]) => ({
      modelId,
      allocatedQty,
    })),
  );
  (prisma.branchOrderDetail.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.branchOrder.findFirst as jest.Mock).mockImplementation(async (args: { where?: { status?: string } }) => {
    if (args?.where?.status === "draft") return state.draft;
    return null;
  });
  (prisma.productModel.findFirst as jest.Mock).mockImplementation(async (args: { where?: { id?: string } }) => ({
    skuCode: args?.where?.id === "model-2" ? "SKU-2" : "SKU-1",
  }));
  (prisma.branchOrderDetail.update as jest.Mock).mockResolvedValue({});
  (prisma.orderSuggestionAllocation.update as jest.Mock).mockResolvedValue({});
  (prisma.branchOrder.create as jest.Mock).mockImplementation(async (args: { data: {
    status: string;
    orderNumber: string;
    details: { create: { modelId: string; quantity: number }[] };
  } }) => {
    const details = args.data.details.create.map((line, index) => ({
      id: `detail-${index + 1}`,
      modelId: line.modelId,
      quantity: line.quantity,
      suggestionAllocation: null,
    }));
    state.draft = { id: "order-1", orderNumber: args.data.orderNumber, details };
    return { id: "order-1", orderNumber: args.data.orderNumber, status: args.data.status, details };
  });
  (prisma.orderSuggestionAllocation.create as jest.Mock).mockImplementation(async (args: { data: {
    modelId: string;
    orderDetailId: string;
    allocatedQty: number;
    sourceQty: number;
    sourceKind: string;
  } }) => {
    const current = state.allocatedByModel.get(args.data.modelId) ?? 0;
    state.allocatedByModel.set(args.data.modelId, current + args.data.allocatedQty);
    const detail = state.draft?.details.find((row) => row.id === args.data.orderDetailId);
    if (detail) {
      detail.quantity = args.data.allocatedQty;
      detail.suggestionAllocation = {
        allocatedQty: args.data.allocatedQty,
        sourceQty: args.data.sourceQty,
        sourceKind: args.data.sourceKind,
      };
    }
    return args.data;
  });
});

describe("suggestionApplyService.apply", () => {
  it("creates a draft and does not submit it", async () => {
    const result = await suggestionApplyService.apply(actor, {
      branchId: "branch-1",
      orderType: "auto_replenish",
      lines: [{ modelId: "model-1", quantity: 5 }],
    });

    expect(result.createdDraft).toBe(true);
    expect(result.orderId).toBe("order-1");
    const created = (prisma.branchOrder.create as jest.Mock).mock.calls[0][0].data;
    expect(created.status).toBe("draft");
    expect(created.approvalLevels).toBeUndefined();
    expect(prisma.branchOrder.update).not.toHaveBeenCalled();
    expect(orderService.submitDraft).not.toHaveBeenCalled();
    expect(prisma.orderSuggestionAllocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          allocatedQty: 5,
          sourceQty: 5,
          sourceKind: "planning_drop1",
          periodId: "period-1",
          planningRunId: "run-1",
        }),
      }),
    );
  });

  it("rejects a second apply that would duplicate the same units", async () => {
    await suggestionApplyService.apply(actor, {
      branchId: "branch-1",
      orderType: "auto_replenish",
      lines: [{ modelId: "model-1", quantity: 5 }],
    });

    await expect(
      suggestionApplyService.apply(actor, {
        branchId: "branch-1",
        orderType: "auto_replenish",
        lines: [{ modelId: "model-1", quantity: 5 }],
      }),
    ).rejects.toThrow(/remaining suggestion \(0\)/);
    expect(prisma.branchOrder.create).toHaveBeenCalledTimes(1);
    expect(state.allocatedByModel.get("model-1")).toBe(5);
  });

  it("allocates only the selected quantity and leaves the remainder", async () => {
    resetPlanning({ "model-1": 5, "model-2": 4 });
    const result = await suggestionApplyService.apply(actor, {
      branchId: "branch-1",
      orderType: "auto_replenish",
      lines: [{ modelId: "model-1", quantity: 2 }],
    });

    expect(result.applied).toEqual([
      expect.objectContaining({ modelId: "model-1", quantityAdded: 2 }),
    ]);
    const created = (prisma.branchOrder.create as jest.Mock).mock.calls[0][0].data;
    expect(created.details.create).toHaveLength(1);
    expect(state.allocatedByModel.has("model-2")).toBe(false);

    const listed = await suggestionApplyService.list(actor, {
      branchId: "branch-1",
      orderType: "auto_replenish",
    });
    expect(listed.rows.find((row) => row.modelId === "model-1")?.suggestedQty).toBe(3);
    expect(listed.rows.find((row) => row.modelId === "model-2")?.suggestedQty).toBe(4);
  });

  it("does not overwrite a hand-edited line when the published qty changes", async () => {
    resetPlanning({ "model-1": 12 });
    state.allocatedByModel.set("model-1", 10);
    state.draft = {
      id: "order-1",
      orderNumber: "SO#1",
      details: [
        {
          id: "detail-1",
          modelId: "model-1",
          quantity: 7,
          suggestionAllocation: { allocatedQty: 10, sourceQty: 10, sourceKind: "planning_drop1" },
        },
      ],
    };

    const listed = await suggestionApplyService.list(actor, {
      branchId: "branch-1",
      orderType: "auto_replenish",
    });
    expect(listed.rows[0]?.suggestedQty).toBe(2);
    expect(listed.rows[0]?.sourceChanged).toBe(true);
    expect(listed.rows[0]?.onHandQty).toBe(4);
    expect(listed.rows[0]?.drop1Qty).toBe(12);

    const result = await suggestionApplyService.apply(actor, {
      branchId: "branch-1",
      orderType: "auto_replenish",
      lines: [{ modelId: "model-1", quantity: 2 }],
    });
    expect(result.applied).toEqual([]);
    expect(result.reviews[0]?.message).toMatch(/edited on the draft/);
    expect(prisma.branchOrderDetail.update).not.toHaveBeenCalled();
    expect(prisma.orderSuggestionAllocation.update).not.toHaveBeenCalled();
    expect(state.draft?.details[0]?.quantity).toBe(7);
    expect(state.allocatedByModel.get("model-1")).toBe(10);
    expect(orderService.submitDraft).not.toHaveBeenCalled();
  });

  it("rejects a user outside the branch scope", async () => {
    (getUserBranchIds as jest.Mock).mockResolvedValue(["other-branch"]);
    await expect(
      suggestionApplyService.list(actor, { branchId: "branch-1", orderType: "auto_replenish" }),
    ).rejects.toThrow(/area of responsibility/);
    await expect(
      suggestionApplyService.apply(actor, {
        branchId: "branch-1",
        orderType: "auto_replenish",
        lines: [{ modelId: "model-1", quantity: 1 }],
      }),
    ).rejects.toThrow(/area of responsibility/);
    expect(prisma.planningPeriod.findFirst).not.toHaveBeenCalled();
    expect(prisma.branchOrder.create).not.toHaveBeenCalled();
  });

  it("returns the empty planning message when nothing is released", async () => {
    (prisma.demandPlanningRun.findFirst as jest.Mock).mockResolvedValue(null);
    const listed = await suggestionApplyService.list(actor, {
      branchId: "branch-1",
      orderType: "auto_replenish",
    });
    expect(listed.rows).toEqual([]);
    expect(listed.message).toBe(NO_PLANNING_SUGGESTION_MESSAGE);
  });
});

describe("manual and special suggestions", () => {
  it("counts outstanding supply once and does not invent a qty without a shelf max", async () => {
    (reasonStatusRepository.findCodeId as jest.Mock).mockImplementation(
      async (_tenant: string, _category: string, code: string) => ({ id: code === "STK" ? "stk" : "dit" }),
    );
    (prisma.branchOrder.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.branchPlanogram.findMany as jest.Mock).mockResolvedValue([
      { modelId: "model-1", maxQty: 10, model: { skuCode: "SKU-1", name: "Widget" } },
    ]);
    (prisma.branchOrderDetail.findMany as jest.Mock).mockResolvedValue([
      {
        modelId: "model-1",
        quantity: 4,
        order: {
          deliveries: [
            {
              id: "delivery-1",
              lines: [1, 2, 3, 4].map(() => ({
                serialNumber: {
                  modelId: "model-1",
                  branchInventories: [{ statusCodeId: "dit" }],
                },
              })),
            },
          ],
        },
      },
    ]);
    (prisma.branchInventory.findMany as jest.Mock).mockImplementation(async (args: { where?: { statusCodeId?: string } }) => {
      if (args?.where?.statusCodeId === "stk") {
        return [1, 2, 3].map(() => ({ serialNumber: { modelId: "model-1" } }));
      }
      if (args?.where?.statusCodeId === "dit") {
        return [1, 2, 3, 4].map(() => ({
          serialNumber: { modelId: "model-1", deliveryLines: [{ deliveryId: "delivery-1" }] },
        }));
      }
      return [];
    });

    const listed = await suggestionApplyService.list(actor, {
      branchId: "branch-1",
      orderType: "manual",
    });
    expect(listed.rows[0]).toMatchObject({
      stkQty: 3,
      outstandingQty: 4,
      suggestedQty: 3,
      canSelect: true,
    });

    (prisma.branchPlanogram.findMany as jest.Mock).mockResolvedValue([]);
    const empty = await suggestionApplyService.list(actor, {
      branchId: "branch-1",
      orderType: "manual",
    });
    expect(empty.rows).toEqual([]);
    expect(empty.message).toBe(NO_PLANOGRAM_MAX_MESSAGE);

    (prisma.branchPlanogram.findMany as jest.Mock).mockResolvedValue([
      { modelId: "model-1", maxQty: null, model: { skuCode: "SKU-1", name: "Widget" } },
    ]);
    const missingMax = await suggestionApplyService.list(actor, {
      branchId: "branch-1",
      orderType: "manual",
    });
    expect(missingMax.rows[0]?.suggestedQty).toBeNull();
    expect(missingMax.rows[0]?.canSelect).toBe(false);
    expect(missingMax.rows[0]?.message).toBe(NO_PLANOGRAM_MAX_MESSAGE);
  });

  it("returns no suggested quantity for special orders", async () => {
    (prisma.branchOrder.findFirst as jest.Mock).mockResolvedValue(null);
    const listed = await suggestionApplyService.list(actor, {
      branchId: "branch-1",
      orderType: "special",
    });
    expect(listed.rows).toEqual([]);
    expect(listed.message).toBe(SPECIAL_NO_SUGGESTION_MESSAGE);
    expect(prisma.demandPlanningRun.findFirst).not.toHaveBeenCalled();
    expect(prisma.branchPlanogram.findMany).not.toHaveBeenCalled();

    await expect(
      suggestionApplyService.apply(actor, {
        branchId: "branch-1",
        orderType: "special",
        lines: [{ modelId: "model-1", quantity: 1 }],
      }),
    ).rejects.toThrow(SPECIAL_NO_SUGGESTION_MESSAGE);
    expect(prisma.branchOrder.create).not.toHaveBeenCalled();
    expect(orderService.submitDraft).not.toHaveBeenCalled();
  });
});
