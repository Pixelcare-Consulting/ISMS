jest.mock("@/features/orders/services/suggestion-apply.service", () => ({
  suggestionApplyService: {
    assertSubmittable: jest.fn(),
    allocationEditsForLineChange: jest.fn(),
    list: jest.fn(),
    apply: jest.fn(),
  },
}));

jest.mock("@/features/orders/repositories/order.repository", () => ({
  orderRepository: {
    findById: jest.fn(),
    submitDraft: jest.fn(),
  },
}));

jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));

jest.mock("@/lib/notifications/workflow-email", () => ({
  sendWorkflowEmail: jest.fn(),
}));

jest.mock("@/features/sap/services/sap.service", () => ({
  sapService: {},
}));

jest.mock("@/features/branch-quotas/services/branch-quota.service", () => ({
  branchQuotaService: { assertWithinQuota: jest.fn() },
}));

jest.mock("@/features/ordering/services/ordering-policy.service", () => ({
  orderingPolicyService: { getPolicy: jest.fn() },
}));

jest.mock("@/features/branches/repositories/branch.repository", () => ({
  branchRepository: { findScheduleContext: jest.fn() },
}));

jest.mock("@/features/master-data/repositories/master-data.repository", () => ({
  masterDataRepository: { findModel: jest.fn(), listModelsForOrderPricing: jest.fn() },
}));

jest.mock("@/features/planogram/repositories/planogram.repository", () => ({
  planogramRepository: { findPlanogramEntry: jest.fn(), countStockForModel: jest.fn() },
}));

jest.mock("@/lib/aor/scope", () => ({
  getUserBranchIds: jest.fn(),
}));

import type { BranchOrderType } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { getInitialOrderStatus } from "@/features/orders/constants/order-workflow";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { orderService } from "@/features/orders/services/order.service";
import { suggestionApplyService } from "@/features/orders/services/suggestion-apply.service";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";

const submitDraft = orderRepository.submitDraft as jest.Mock;

function draftOrder(orderType: BranchOrderType) {
  return {
    id: "order-1",
    status: "draft" as const,
    orderType,
    branchId: "branch-1",
    orderNumber: "SO#2026-10-00001",
    branch: { name: "Branch" },
    details: [
      {
        id: "detail-1",
        modelId: "model-1",
        quantity: 2,
        model: { skuCode: "SKU-1" },
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
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
    skuCode: "SKU-1",
    status: "active",
  });
  (planogramRepository.findPlanogramEntry as jest.Mock).mockResolvedValue({ maxQty: 20 });
  (planogramRepository.countStockForModel as jest.Mock).mockResolvedValue(0);
  (suggestionApplyService.assertSubmittable as jest.Mock).mockResolvedValue(undefined);
  (auditService.log as jest.Mock).mockResolvedValue(undefined);
  submitDraft.mockImplementation(
    async (
      _tenantId: string,
      _orderId: string,
      orderType: BranchOrderType,
      hooks?: { beforeStatusChange?: (tx: object) => Promise<void> },
    ) => {
      await hooks?.beforeStatusChange?.({});
      const order = draftOrder(orderType);
      return {
        ...order,
        status: getInitialOrderStatus(orderType),
      };
    },
  );
});

describe("submitDraft initial status", () => {
  it.each([
    ["auto_replenish", "pending_tl"],
    ["manual", "pending_sp"],
    ["special", "pending_sp"],
  ] as const)("submits %s as %s and rechecks suggestion lines", async (orderType, status) => {
    (orderRepository.findById as jest.Mock).mockResolvedValue(draftOrder(orderType));

    await orderService.submitDraft("tenant-1", "user-1", "order-1", { hasFullAccess: true });

    expect(getInitialOrderStatus(orderType)).toBe(status);
    expect(suggestionApplyService.apply).not.toHaveBeenCalled();
    expect(suggestionApplyService.assertSubmittable).toHaveBeenCalled();
    expect(submitDraft).toHaveBeenCalledWith(
      "tenant-1",
      "order-1",
      orderType,
      expect.objectContaining({ beforeStatusChange: expect.any(Function) }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.submitted",
        metadata: expect.objectContaining({ from: "draft", to: status }),
      }),
    );
  });
});
