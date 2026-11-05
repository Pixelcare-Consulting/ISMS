jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    branchDeliveryLine: { count: jest.fn() },
    reasonStatusCode: { findFirst: jest.fn() },
    branchDelivery: { updateMany: jest.fn() },
    branchOrder: { updateMany: jest.fn() },
    deliverySapDocument: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchDelivery: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/features/logistics/services/delivery-scope", () => ({ authorizeDeliveryScope: jest.fn() }));
jest.mock("@/features/logistics/services/sap-copy-to-follow.notifier", () => ({
  notifyCopyToAttention: jest.fn(async () => "cleared"),
}));

import * as dbClient from "@/lib/database/client";
import { closeOrderClosedInSap } from "@/features/logistics/services/sap-closed-order.service";
import { notifyCopyToAttention } from "@/features/logistics/services/sap-copy-to-follow.notifier";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;
const mockPrisma = dbClient.prisma as unknown as Mocks;
const actor = { tenantId: "t1", userId: "u1", permissions: ["logistics.delivery.dispatch"] };

function delivery(flagged = true) {
  return {
    id: "del1",
    branchId: "b1",
    sourceWarehouseId: "w1",
    order: { id: "o1", orderNumber: "SAP-SO-97001" },
    sapDocuments: flagged ? [{ id: "doc1", displayNo: "97001" }] : [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.branchDelivery.findFirst.mockResolvedValue(delivery());
  mockTx.branchDeliveryLine.count.mockResolvedValue(0);
  mockTx.reasonStatusCode.findFirst.mockImplementation(async ({ where }: { where: { code: string } }) => ({
    id: `wf-${where.code}`,
  }));
  mockTx.branchDelivery.updateMany.mockResolvedValue({ count: 1 });
  mockTx.branchOrder.updateMany.mockResolvedValue({ count: 1 });
});

describe("closeOrderClosedInSap", () => {
  it("cancels the order, rejects the empty delivery, resolves the flag and refreshes the notice", async () => {
    await expect(closeOrderClosedInSap(actor, "del1")).resolves.toEqual({ orderNumber: "SAP-SO-97001" });

    expect(mockTx.branchDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: "del1", tenantId: "t1", statusCodeId: "wf-approved" },
      data: { statusCodeId: "wf-rejected" },
    });
    expect(mockTx.branchOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", tenantId: "t1", status: "approved" },
      data: { status: "cancelled" },
    });
    expect(mockTx.deliverySapDocument.update).toHaveBeenCalledWith({
      where: { id: "doc1" },
      data: { status: "RESOLVED" },
    });
    expect(notifyCopyToAttention).toHaveBeenCalledWith("t1");
  });

  it("refuses when SAP has not reported the SO closed", async () => {
    mockPrisma.branchDelivery.findFirst.mockResolvedValue(delivery(false));
    await expect(closeOrderClosedInSap(actor, "del1")).rejects.toThrow(
      "SAP has not reported this order's SO as closed without a DR.",
    );
    expect(mockTx.branchOrder.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a delivery that already has units", async () => {
    mockTx.branchDeliveryLine.count.mockResolvedValue(2);
    await expect(closeOrderClosedInSap(actor, "del1")).rejects.toThrow(
      "This delivery already has units, so it cannot be closed here.",
    );
    expect(mockTx.branchOrder.updateMany).not.toHaveBeenCalled();
  });
});
