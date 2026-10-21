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
    findById: jest.fn(),
    findManyByIds: jest.fn(),
    submitDraft: jest.fn(),
    addApproval: jest.fn(),
    addRejection: jest.fn(),
    updateStatus: jest.fn(),
    finalizeApproved: jest.fn(),
    findSapRoutingContext: jest.fn(),
    forceCancelFromPending: jest.fn(),
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
  sapService: {
    emitApprovedOrder: jest.fn(),
    processPendingJobs: jest.fn(),
  },
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

import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { notificationService } from "@/features/notifications/services/notification.service";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { orderService } from "@/features/orders/services/order.service";
import { suggestionApplyService } from "@/features/orders/services/suggestion-apply.service";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { sapService } from "@/features/sap/services/sap.service";

const createNotification = notificationService.createNotification as jest.Mock;
const findById = orderRepository.findById as jest.Mock;

const LOADED_AT = new Date("2026-10-19T02:00:00.000Z");

function orderFixture(opts?: {
  status?: BranchOrderStatus;
  orderType?: BranchOrderType;
  createdById?: string;
}) {
  return {
    id: "order-1",
    status: opts?.status ?? "draft",
    orderType: opts?.orderType ?? "manual",
    orderNumber: "SO#2026-10-00001",
    branchId: "branch-1",
    createdById: opts?.createdById ?? "creator-1",
    updatedAt: LOADED_AT,
    processedAt: null,
    sapDocRef: null,
    branch: { name: "North Branch", sapCode: "SAP1", deliverySchedule: null },
    details: [
      {
        id: "detail-1",
        modelId: "model-1",
        quantity: 2,
        model: { skuCode: "SKU-1", brandId: "brand-1" },
      },
    ],
    deliveries: [],
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
    name: "North Branch",
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
  createNotification.mockResolvedValue({ id: "notice-1" });
  (orderRepository.addApproval as jest.Mock).mockResolvedValue({});
  (orderRepository.addRejection as jest.Mock).mockResolvedValue({});
  (orderRepository.updateStatus as jest.Mock).mockResolvedValue({});
  (orderRepository.finalizeApproved as jest.Mock).mockResolvedValue(undefined);
  (orderRepository.findSapRoutingContext as jest.Mock).mockResolvedValue({
    branch: {
      name: "North Branch",
      sapCode: "WH-N",
      primaryWarehouse: { id: "w1", code: "WP" },
      dealer: {
        name: "Dealer X",
        sapCode: "C001",
        modeOfPayment: { name: "Consignment", kind: "CONSIGNMENT" },
      },
    },
    mainWarehouse: { id: "w-main", code: "WM" },
  });
  (sapService.emitApprovedOrder as jest.Mock).mockResolvedValue(undefined);
  (sapService.processPendingJobs as jest.Mock).mockResolvedValue(undefined);
});

describe("order step notifications", () => {
  it.each([
    ["auto_replenish", "tl", "/orders/auto-replenish"],
    ["manual", "sp", "/orders/manual"],
    ["special", "sp", "/orders/special"],
  ] as const)(
    "notifies the first approver when a %s draft is submitted",
    async (orderType, roleSlug, href) => {
      const draft = orderFixture({ status: "draft", orderType });
      findById.mockResolvedValue(draft);
      (orderRepository.submitDraft as jest.Mock).mockResolvedValue({
        ...draft,
        status: orderType === "auto_replenish" ? "pending_tl" : "pending_sp",
      });

      await orderService.submitDraft("tenant-1", "user-1", "order-1", { hasFullAccess: true });

      expect(createNotification).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        data: expect.objectContaining({
          audience: "ROLE",
          roleSlug,
          userId: null,
          type: "order",
          href,
          title: "SO#2026-10-00001 · North Branch",
          body: "Submitted for review.",
        }),
      });
    },
  );

  it("notifies supply planning when auto replenish leaves the team leader", async () => {
    findById.mockResolvedValue(
      orderFixture({ status: "pending_tl", orderType: "auto_replenish" }),
    );

    await orderService.approve("tenant-1", "user-1", "order-1", ["tl"], {
      comment: "Looks good",
    });

    expect(createNotification).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      data: expect.objectContaining({
        audience: "ROLE",
        roleSlug: "sp",
        userId: null,
        href: "/orders/auto-replenish",
        title: "SO#2026-10-00001 · North Branch",
      }),
    });
  });

  it("notifies the creator when the order is approved", async () => {
    const order = orderFixture({ status: "pending_sp", orderType: "manual" });
    findById.mockResolvedValueOnce(order).mockResolvedValueOnce({
      ...order,
      status: "approved",
      processedAt: new Date("2026-10-19T03:00:00.000Z"),
    });

    await orderService.approve("tenant-1", "user-1", "order-1", ["sp"]);

    expect(createNotification).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      data: expect.objectContaining({
        audience: "USER",
        userId: "creator-1",
        roleSlug: null,
        href: "/orders/manual",
        body: "Approved.",
      }),
    });
  });

  it("does not notify the creator about their own approval", async () => {
    const order = orderFixture({
      status: "pending_sp",
      orderType: "manual",
      createdById: "user-1",
    });
    findById.mockResolvedValueOnce(order).mockResolvedValueOnce({
      ...order,
      status: "approved",
      processedAt: new Date("2026-10-19T03:00:00.000Z"),
    });

    await orderService.approve("tenant-1", "user-1", "order-1", ["sp"]);

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("notifies the creator when the order is rejected", async () => {
    findById.mockResolvedValue(
      orderFixture({ status: "pending_tl", orderType: "auto_replenish" }),
    );

    await orderService.reject("tenant-1", "user-1", "order-1", ["tl"], "Not this week");

    expect(createNotification).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      data: expect.objectContaining({
        audience: "USER",
        userId: "creator-1",
        href: "/orders/auto-replenish",
        body: "Rejected.",
      }),
    });
  });

  it("notifies the creator when supply planning cancels the order", async () => {
    findById.mockResolvedValue(orderFixture({ status: "pending_sp", orderType: "special" }));

    await orderService.reject("tenant-1", "user-1", "order-1", ["sp"], "Cancel request");

    expect(createNotification).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      data: expect.objectContaining({
        audience: "USER",
        userId: "creator-1",
        href: "/orders/special",
        body: "Cancelled.",
      }),
    });
  });

  it("notifies the creator when a super admin cancels the order", async () => {
    const order = orderFixture({ status: "pending_sp", orderType: "manual" });
    (orderRepository.findManyByIds as jest.Mock).mockResolvedValue([order]);
    (orderRepository.forceCancelFromPending as jest.Mock).mockResolvedValue({ count: 1 });

    await orderService.adminBulkCancelOrDiscard("tenant-1", "admin-1", ["order-1"], {
      roleSlugs: ["super_admin"],
    });

    expect(createNotification).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "admin-1",
      data: expect.objectContaining({
        audience: "USER",
        userId: "creator-1",
        href: "/orders/manual",
        body: "Cancelled.",
      }),
    });
  });
});
