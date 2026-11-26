jest.mock("@/lib/auth/permission-holders", () => ({
  listUserIdsWithPermission: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/features/orders/services/order-sap-close", () => ({
  closeOrderSapDocument: jest.fn(),
}));
jest.mock("@/features/orders/services/suggestion-apply.service", () => ({
  suggestionApplyService: {
    assertSubmittable: jest.fn(),
    allocationEditsForLineChange: jest.fn(),
    list: jest.fn(),
    apply: jest.fn(),
  },
}));
jest.mock("@/features/orders/repositories/order.repository", () => ({
  ORDER_CHANGED_MESSAGE: "This order changed. Refresh and review again.",
  orderRepository: {
    findOpenOrderForBranchBrand: jest.fn(),
    create: jest.fn(),
  },
}));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));
jest.mock("@/lib/notifications/workflow-email", () => ({
  sendWorkflowEmail: jest.fn(),
}));
jest.mock("@/features/notifications/services/notification.service", () => ({
  notificationService: { createNotification: jest.fn() },
}));
jest.mock("@/features/sap/services/sap.service", () => ({
  sapService: { emitApprovedOrder: jest.fn(), processPendingJobs: jest.fn() },
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
jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));
jest.mock("@/features/aors/repositories/aor.repository", () => ({
  aorRepository: { listExistingBranchIds: jest.fn() },
}));

import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { orderService } from "@/features/orders/services/order.service";

const findModel = masterDataRepository.findModel as jest.Mock;
const findOpenOrder = orderRepository.findOpenOrderForBranchBrand as jest.Mock;

const openOrder = {
  orderNumber: "SO-1001",
  orderType: "manual" as const,
  branchName: "Makati",
  brandName: "Devant",
};

describe("orderService.create brand rules", () => {
  beforeEach(() => {
    findModel.mockReset();
    findOpenOrder.mockReset();
  });

  it.each(["manual", "special"] as const)(
    "throws when %s create finds an open order for the branch and brand",
    async (orderType) => {
      findModel.mockResolvedValue({ brandId: "brand-devant" });
      findOpenOrder.mockResolvedValue({ ...openOrder, orderType });

      await expect(
        orderService.create("tenant-1", "user-1", {
          branchId: "branch-1",
          orderType,
          brandId: "brand-devant",
          hasFullAccess: true,
          details: [{ modelId: "model-1", quantity: 1 }],
        }),
      ).rejects.toThrow(
        `Makati already has an open ${orderType === "manual" ? "Manual" : "Special"} order (SO-1001) for Devant. You can create another after that order is approved, rejected, or cancelled.`,
      );

      expect(orderRepository.create).not.toHaveBeenCalled();
    },
  );

  it.each(["manual", "special"] as const)(
    "rejects a %s line from another brand",
    async (orderType) => {
      findModel.mockResolvedValue({ brandId: "brand-other" });

      await expect(
        orderService.create("tenant-1", "user-1", {
          branchId: "branch-1",
          orderType,
          brandId: "brand-devant",
          hasFullAccess: true,
          details: [{ modelId: "model-other", quantity: 2 }],
        }),
      ).rejects.toThrow("This order is for one brand. Remove models from another brand.");

      expect(findOpenOrder).not.toHaveBeenCalled();
      expect(orderRepository.create).not.toHaveBeenCalled();
    },
  );

  it.each(["manual", "special"] as const)(
    "rejects a %s order that has no brand",
    async (orderType) => {
      await expect(
        orderService.create("tenant-1", "user-1", {
          branchId: "branch-1",
          orderType,
          brandId: "  ",
          hasFullAccess: true,
          details: [{ modelId: "model-1", quantity: 1 }],
        }),
      ).rejects.toThrow("Choose one brand for this order.");

      expect(findModel).not.toHaveBeenCalled();
      expect(findOpenOrder).not.toHaveBeenCalled();
    },
  );
});
