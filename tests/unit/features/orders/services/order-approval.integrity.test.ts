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
    addApproval: jest.fn(),
    updateStatus: jest.fn(),
    finalizeApproved: jest.fn(),
    findSapRoutingContext: jest.fn(),
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

jest.mock("@/features/aors/repositories/aor.repository", () => ({
  aorRepository: { listExistingBranchIds: jest.fn() },
}));
jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { orderService } from "@/features/orders/services/order.service";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { sapService } from "@/features/sap/services/sap.service";
import { sendWorkflowEmail } from "@/lib/notifications/workflow-email";

const findById = orderRepository.findById as jest.Mock;
const addApproval = orderRepository.addApproval as jest.Mock;
const updateStatus = orderRepository.updateStatus as jest.Mock;
const finalizeApproved = orderRepository.finalizeApproved as jest.Mock;
const findSapRoutingContext = orderRepository.findSapRoutingContext as jest.Mock;

const ROUTING_CONTEXT = {
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
};
const emitApprovedOrder = sapService.emitApprovedOrder as jest.Mock;

const LOADED_AT = new Date("2026-10-19T02:00:00.000Z");

function reviewOrder(opts?: { status?: BranchOrderStatus; orderType?: BranchOrderType }) {
  return {
    id: "order-1",
    status: opts?.status ?? "pending_sp",
    orderType: opts?.orderType ?? "manual",
    orderNumber: "SO#2026-10-00001",
    branchId: "branch-1",
    updatedAt: LOADED_AT,
    branch: { name: "Branch", sapCode: "SAP1", deliverySchedule: null },
    details: [
      {
        id: "detail-1",
        quantity: 4,
        remarks: "Requester note",
        model: { skuCode: "SKU-1", brandId: "brand-1" },
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
  (auditService.log as jest.Mock).mockResolvedValue(undefined);
  (sendWorkflowEmail as jest.Mock).mockResolvedValue(undefined);
  emitApprovedOrder.mockResolvedValue(undefined);
  findSapRoutingContext.mockResolvedValue(ROUTING_CONTEXT);
  (sapService.processPendingJobs as jest.Mock).mockResolvedValue(undefined);
  addApproval.mockResolvedValue({});
  updateStatus.mockResolvedValue({});
});

describe("order approval integrity", () => {
  it("rejects a detail that is not on the order", async () => {
    findById.mockResolvedValue(reviewOrder());

    await expect(
      orderService.approve("tenant-1", "user-1", "order-1", ["sp"], {
        lineAdjustments: [{ detailId: "foreign-detail", approvedQty: 0 }],
      }),
    ).rejects.toThrow("One or more lines do not belong to this order.");

    expect(finalizeApproved).not.toHaveBeenCalled();
    expect(addApproval).not.toHaveBeenCalled();
    expect(emitApprovedOrder).not.toHaveBeenCalled();
  });

  it.each([2.5, 0, 5])("rejects approved quantity %s", async (approvedQty) => {
    findById.mockResolvedValue(reviewOrder());

    await expect(
      orderService.approve("tenant-1", "user-1", "order-1", ["sp"], {
        lineAdjustments: [{ detailId: "detail-1", approvedQty }],
      }),
    ).rejects.toThrow(
      "Approved quantity must be a whole number from 1 through the requested quantity (4).",
    );

    expect(finalizeApproved).not.toHaveBeenCalled();
    expect(emitApprovedOrder).not.toHaveBeenCalled();
  });

  it("rejects a stale updatedAt before approving", async () => {
    findById.mockResolvedValue(reviewOrder());

    await expect(
      orderService.approve("tenant-1", "user-1", "order-1", ["sp"], {
        expectedUpdatedAt: "2026-10-18T02:00:00.000Z",
        lineAdjustments: [{ detailId: "detail-1", approvedQty: 2, spRemarks: "Align to shelf" }],
      }),
    ).rejects.toThrow("This order changed. Refresh and review again.");

    expect(finalizeApproved).not.toHaveBeenCalled();
    expect(addApproval).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
    expect(emitApprovedOrder).not.toHaveBeenCalled();
  });

  it("rejects SP remarks from a role that is not approving pending SP", async () => {
    findById.mockResolvedValue(
      reviewOrder({ status: "pending_tl", orderType: "auto_replenish" }),
    );

    await expect(
      orderService.approve("tenant-1", "user-1", "order-1", ["tl"], {
        lineAdjustments: [{ detailId: "detail-1", approvedQty: 4, spRemarks: "Not yet" }],
      }),
    ).rejects.toThrow(
      "Only Supply Planning can save line remarks while the order is pending Supply Planning.",
    );

    expect(addApproval).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
    expect(finalizeApproved).not.toHaveBeenCalled();
    expect(emitApprovedOrder).not.toHaveBeenCalled();
  });

  it("keeps auto-replenish team leader approval on the step before final SP", async () => {
    findById.mockResolvedValue(
      reviewOrder({ status: "pending_tl", orderType: "auto_replenish" }),
    );

    await orderService.approve("tenant-1", "user-1", "order-1", ["tl"], {
      comment: "Looks good",
    });

    expect(addApproval).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({ level: 1, roleSlug: "tl", approvedById: "user-1" }),
    );
    expect(updateStatus).toHaveBeenCalledWith("tenant-1", "order-1", "pending_sp");
    expect(finalizeApproved).not.toHaveBeenCalled();
    expect(emitApprovedOrder).not.toHaveBeenCalled();
  });

  it("blocks final approval with the routing message and writes nothing", async () => {
    findById.mockResolvedValue(reviewOrder());
    findSapRoutingContext.mockResolvedValue({
      ...ROUTING_CONTEXT,
      branch: { ...ROUTING_CONTEXT.branch, dealer: null },
    });

    await expect(
      orderService.approve("tenant-1", "user-1", "order-1", ["sp"], {
        expectedUpdatedAt: LOADED_AT.toISOString(),
      }),
    ).rejects.toThrow("North Branch has no dealer. Set the dealer before final approval.");
    expect(finalizeApproved).not.toHaveBeenCalled();
  });

  it("stores the routed SAP document type on final approval", async () => {
    findById.mockResolvedValue(reviewOrder());
    await orderService.approve("tenant-1", "user-1", "order-1", ["sp"], {
      expectedUpdatedAt: LOADED_AT.toISOString(),
    });
    expect(finalizeApproved).toHaveBeenCalledWith(
      "tenant-1",
      "order-1",
      expect.objectContaining({ sapDocType: "ITR" }),
    );
  });

  it("writes SP remarks in the final transaction and emits SAP only after it", async () => {
    const order = reviewOrder();
    const calls: string[] = [];
    findById
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce({
        ...order,
        status: "approved",
        processedAt: new Date("2026-10-19T03:00:00.000Z"),
        details: [{ ...order.details[0], approvedQty: 2 }],
      });
    finalizeApproved.mockImplementation(async () => {
      calls.push("transaction");
      expect(emitApprovedOrder).not.toHaveBeenCalled();
    });
    emitApprovedOrder.mockImplementation(async () => {
      calls.push("sap");
    });

    await orderService.approve("tenant-1", "user-1", "order-1", ["sp"], {
      comment: "Approved for the window",
      expectedUpdatedAt: LOADED_AT.toISOString(),
      reviewSnapshot: { onHand: 4, sales: "N/A" },
      lineAdjustments: [{ detailId: "detail-1", approvedQty: 2, spRemarks: "Align to shelf" }],
    });

    expect(calls).toEqual(["transaction", "sap"]);
    expect(addApproval).not.toHaveBeenCalled();
    expect(finalizeApproved).toHaveBeenCalledTimes(1);
    expect(finalizeApproved).toHaveBeenCalledWith(
      "tenant-1",
      "order-1",
      expect.objectContaining({
        fromStatus: "pending_sp",
        spaRemarks: "Approved for the window",
        reviewSnapshot: { onHand: 4, sales: "N/A" },
        lines: [
          {
            detailId: "detail-1",
            approvedQty: 2,
            spRemarks: "Align to shelf",
          },
        ],
      }),
    );
    expect(emitApprovedOrder).toHaveBeenCalledTimes(1);
    // Only this order's job runs inline, never the tenant's whole backlog.
    expect(sapService.processPendingJobs).toHaveBeenCalledWith("tenant-1", "user-1", 1, {
      referenceType: "BranchOrder",
      referenceId: "order-1",
    });
  });
});
