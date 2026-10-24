jest.mock("@/lib/database/client", () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

jest.mock("@/features/sap/services/sap.service", () => ({
  sapService: {
    emitApprovedOrder: jest.fn(),
    processPendingJobs: jest.fn(),
  },
}));

import { sapService } from "@/features/sap/services/sap.service";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { prisma } from "@/lib/database/client";

const emitApprovedOrder = sapService.emitApprovedOrder as jest.Mock;

const tx = {
  branchOrderDetail: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  branchOrderApprovalLevel: {
    deleteMany: jest.fn(),
    update: jest.fn(),
  },
  branchOrder: {
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  },
  orderSuggestionAllocation: {
    update: jest.fn(),
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const model of Object.values(tx)) {
    for (const method of Object.values(model)) {
      method.mockReset();
    }
  }
  (prisma.$transaction as jest.Mock).mockImplementation(async (work: unknown) => {
    if (typeof work !== "function") {
      throw new Error("Expected an interactive transaction");
    }
    const result = await work(tx);
    expect(emitApprovedOrder).not.toHaveBeenCalled();
    return result;
  });
});

describe("order line and final approval persistence", () => {
  it("updates quantity and amount without clearing requester or SP remarks", async () => {
    tx.branchOrderDetail.findMany.mockResolvedValue([{ id: "detail-1", modelId: "model-1" }]);
    tx.branchOrderDetail.update.mockResolvedValue({});
    tx.branchOrderApprovalLevel.deleteMany.mockResolvedValue({ count: 0 });
    tx.branchOrder.update.mockResolvedValue({ id: "order-1" });

    await orderRepository.updateLines("tenant-1", "order-1", {
      orderType: "manual",
      details: [{ modelId: "model-1", quantity: 3, amount: 30 }],
    });

    expect(tx.branchOrderDetail.update).toHaveBeenCalledWith({
      where: { id: "detail-1" },
      data: { quantity: 3, amount: 30 },
    });
    const data = tx.branchOrderDetail.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty("remarks");
    expect(data).not.toHaveProperty("spRemarks");
    expect(tx.branchOrderDetail.create).not.toHaveBeenCalled();
  });

  it("writes SP remarks in the approval transaction and does not call SAP inside it", async () => {
    const due = new Date("2026-10-21T12:00:00.000Z");
    tx.branchOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.branchOrderDetail.updateMany.mockResolvedValue({ count: 1 });
    tx.branchOrderApprovalLevel.update.mockResolvedValue({});

    await orderRepository.finalizeApproved("tenant-1", "order-1", {
      fromStatus: "pending_sp",
      expectedUpdatedAt: new Date("2026-10-19T02:00:00.000Z"),
      level: 1,
      approvedById: "user-1",
      comment: "Approved for the window",
      spaRemarks: "Approved for the window",
      deliveryDueDate: due,
      brandId: "brand-1",
      reviewSnapshot: { onHand: 4, sales: "N/A" },
      lines: [{ detailId: "detail-1", approvedQty: 2, spRemarks: "Align to shelf" }],
    });

    expect(emitApprovedOrder).not.toHaveBeenCalled();
    expect(sapService.processPendingJobs).not.toHaveBeenCalled();
    expect(tx.branchOrderDetail.updateMany).toHaveBeenCalledWith({
      where: { id: "detail-1", orderId: "order-1" },
      data: { approvedQty: 2, spRemarks: "Align to shelf" },
    });
    const lineData = tx.branchOrderDetail.updateMany.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(lineData).not.toHaveProperty("remarks");
    expect(tx.branchOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "order-1",
          tenantId: "tenant-1",
          status: "pending_sp",
          updatedAt: new Date("2026-10-19T02:00:00.000Z"),
        }),
        data: expect.objectContaining({
          status: "approved",
          spaRemarks: "Approved for the window",
          deliveryDueDate: due,
          reviewSnapshot: { onHand: 4, sales: "N/A" },
          reviewSnapshotAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.branchOrderApprovalLevel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId_level: { orderId: "order-1", level: 1 } },
        data: expect.objectContaining({
          approvedById: "user-1",
          comment: "Approved for the window",
        }),
      }),
    );
  });

  it("keeps approver and brand off updateMany and writes them with update", async () => {
    tx.branchOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.branchOrder.update.mockResolvedValue({});
    tx.branchOrderDetail.updateMany.mockResolvedValue({ count: 1 });
    tx.branchOrderApprovalLevel.update.mockResolvedValue({});

    await orderRepository.finalizeApproved("tenant-1", "order-1", {
      fromStatus: "pending_sp",
      expectedUpdatedAt: new Date("2026-10-19T02:00:00.000Z"),
      level: 1,
      approvedById: "user-1",
      spaRemarks: "Approved for the window",
      brandId: "brand-1",
      reviewSnapshot: { onHand: 4 },
      lines: [{ detailId: "detail-1", approvedQty: 2 }],
    });

    const updateManyData = tx.branchOrder.updateMany.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(updateManyData).toMatchObject({
      status: "approved",
      spaRemarks: "Approved for the window",
      reviewSnapshot: { onHand: 4 },
    });
    expect(updateManyData).not.toHaveProperty("approvedById");
    expect(updateManyData).not.toHaveProperty("brandId");
    expect(updateManyData.processedAt).toEqual(expect.any(Date));
    expect(updateManyData.reviewSnapshotAt).toEqual(expect.any(Date));

    expect(tx.branchOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { approvedById: "user-1", brandId: "brand-1" },
    });
  });

  it("does not write approver or brand when the order changed", async () => {
    tx.branchOrder.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      orderRepository.finalizeApproved("tenant-1", "order-1", {
        fromStatus: "pending_sp",
        level: 1,
        approvedById: "user-1",
        lines: [],
      }),
    ).rejects.toThrow("This order changed. Refresh and review again.");

    expect(tx.branchOrder.update).not.toHaveBeenCalled();
    expect(tx.branchOrderDetail.updateMany).not.toHaveBeenCalled();
    expect(tx.branchOrderApprovalLevel.update).not.toHaveBeenCalled();
  });
});
