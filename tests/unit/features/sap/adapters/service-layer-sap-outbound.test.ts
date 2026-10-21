jest.mock("@/lib/auth/permissions", () => ({ hasPermission: jest.fn() }));
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/database/client", () => {
  const tx = {
    branchOrder: { update: jest.fn() },
    branchOrderDetail: { update: jest.fn() },
    branchDelivery: { findFirst: jest.fn(), update: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchOrder: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));
jest.mock("@/features/sap/repositories/sap-integration.repository", () => ({
  sapIntegrationRepository: { markCompleted: jest.fn() },
}));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn() },
}));
jest.mock("@/features/orders/repositories/order.repository", () => ({
  orderRepository: { findSapRoutingContext: jest.fn() },
}));
jest.mock("@/features/logistics/services/logistics.service", () => ({
  logisticsService: { createDeliveryFromApprovedOrder: jest.fn() },
}));
jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: { requireCodeId: jest.fn().mockResolvedValue("sc1") },
}));
jest.mock("@/features/sap/services/sap-documents", () => ({
  ...jest.requireActual("@/features/sap/services/sap-documents"),
  postSapDocument: jest.fn(),
}));

import * as dbClient from "@/lib/database/client";
import { mockSapOutbound } from "@/features/sap/adapters/mock-sap-outbound";
import { resolveSapOutboundPort } from "@/features/sap/adapters/resolve-sap-outbound";
import { serviceLayerSapOutbound } from "@/features/sap/adapters/service-layer-sap-outbound";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { logisticsService } from "@/features/logistics/services/logistics.service";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";
import { postSapDocument } from "@/features/sap/services/sap-documents";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapIntegrationJob } from "@prisma/client";

const mockTx = (dbClient as unknown as { mockTx: Record<string, Record<string, jest.Mock>> }).mockTx;
const mockPrisma = dbClient.prisma as unknown as { branchOrder: { findFirst: jest.Mock } };
const post = postSapDocument as jest.Mock;
const routingCtx = orderRepository.findSapRoutingContext as jest.Mock;
const createDelivery = logisticsService.createDeliveryFromApprovedOrder as jest.Mock;
const getCreds = sapServiceLayerService.getCredentials as jest.Mock;

const job = { id: "j1", referenceId: "o1" } as SapIntegrationJob;

function order(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    tenantId: "t1",
    orderNumber: "ORD-1",
    branchId: "b1",
    sapDocType: null,
    deliveryDueDate: new Date("2026-11-05T00:00:00Z"),
    branch: { name: "Branch One" },
    details: [
      { id: "d1", quantity: 5, approvedQty: 3, model: { skuCode: "SKU-A" } },
      { id: "d2", quantity: 2, approvedQty: 0, model: { skuCode: "SKU-B" } },
      { id: "d3", quantity: 4, approvedQty: null, model: { skuCode: "SKU-C" } },
    ],
    ...over,
  };
}

function ctx(kind: "CONSIGNMENT" | "OUTRIGHT" | null) {
  return {
    branch: {
      name: "Branch One",
      sapCode: "BR1",
      primaryWarehouse: { id: "w1", code: "WH1" },
      dealer: { name: "Dealer", sapCode: "C100", modeOfPayment: { name: "MOP", kind } },
    },
    mainWarehouse: { id: "wm", code: "MAIN" },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getCreds.mockResolvedValue({ id: "cfg" });
  mockTx.branchDelivery.findFirst.mockResolvedValue(null);
  createDelivery.mockResolvedValue({ id: "del1" });
});

describe("serviceLayerSapOutbound.createApprovedOrderDocument", () => {
  it("ITR job posts InventoryTransferRequests and stores line numbers", async () => {
    mockPrisma.branchOrder.findFirst.mockResolvedValue(order());
    routingCtx.mockResolvedValue(ctx("CONSIGNMENT"));
    post.mockResolvedValue({
      docEntry: 11,
      docNum: 501,
      docDate: "2026-10-21",
      displayNo: "501",
      lineNums: [0, 1],
    });

    const ref = await serviceLayerSapOutbound.createApprovedOrderDocument({
      tenantId: "t1",
      userId: "u1",
      job,
    });

    expect(ref).toBe("ITR-501");
    const [, kind, ismsRef, body] = post.mock.calls[0];
    expect(kind).toBe("ITR");
    expect(ismsRef).toBe("ORD-1");
    expect(JSON.stringify(body)).toContain("SKU-A");
    expect(JSON.stringify(body)).not.toContain("SKU-B");
    expect(mockTx.branchOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sapDocType: "ITR",
          sapDocEntry: 11,
          sapDocNum: 501,
          sapDocRef: "ITR-501",
        }),
      }),
    );
    expect(mockTx.branchOrderDetail.update).toHaveBeenCalledTimes(2);
    expect(mockTx.branchOrderDetail.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1" }, data: { sapLineNum: 0 } }),
    );
    expect(mockTx.branchOrderDetail.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d3" }, data: { sapLineNum: 1 } }),
    );
    expect(createDelivery).toHaveBeenCalledWith(
      "t1",
      "u1",
      expect.objectContaining({ id: "o1" }),
      expect.objectContaining({ sourceWarehouseId: "w1", tx: mockTx, statusCodeId: "sc1" }),
    );
    expect(sapIntegrationRepository.markCompleted).toHaveBeenCalledWith("j1", "ITR-501");
  });

  it("SO job posts Orders with dealer CardCode", async () => {
    mockPrisma.branchOrder.findFirst.mockResolvedValue(order({ sapDocType: "SO" }));
    routingCtx.mockResolvedValue(ctx("OUTRIGHT"));
    post.mockResolvedValue({
      docEntry: 22,
      docNum: 900,
      docDate: "2026-10-21",
      displayNo: "900",
      lineNums: [0, 1],
    });

    const ref = await serviceLayerSapOutbound.createApprovedOrderDocument({
      tenantId: "t1",
      job,
    });

    expect(ref).toBe("SO-900");
    const [, kind, , body] = post.mock.calls[0];
    expect(kind).toBe("SO");
    expect(body.CardCode).toBe("C100");
    expect(body.DocDueDate).toBe("2026-11-05");
  });

  it("job fails with routing message when dealer kind is missing", async () => {
    mockPrisma.branchOrder.findFirst.mockResolvedValue(order());
    routingCtx.mockResolvedValue(ctx(null));

    await expect(
      serviceLayerSapOutbound.createApprovedOrderDocument({ tenantId: "t1", job }),
    ).rejects.toThrow("has no type");
    expect(post).not.toHaveBeenCalled();
  });

  it("fails when SAP returns a different number of lines than were sent", async () => {
    mockPrisma.branchOrder.findFirst.mockResolvedValue(order());
    routingCtx.mockResolvedValue(ctx("CONSIGNMENT"));
    post.mockResolvedValue({ docEntry: 1, docNum: 2, docDate: "d", displayNo: "2", lineNums: [0] });
    await expect(
      serviceLayerSapOutbound.createApprovedOrderDocument({ tenantId: "t1", job }),
    ).rejects.toThrow("SAP returned 1 lines for 2 order lines");
    expect(mockTx.branchOrder.update).not.toHaveBeenCalled();
  });

  it("fails when Service Layer is not configured", async () => {
    getCreds.mockResolvedValue(null);
    await expect(
      serviceLayerSapOutbound.createApprovedOrderDocument({ tenantId: "t1", job }),
    ).rejects.toThrow("SAP Service Layer is not configured");
  });
});

describe("resolveSapOutboundPort", () => {
  const original = process.env.SAP_OUTBOUND_ADAPTER;
  afterEach(() => {
    if (original === undefined) delete process.env.SAP_OUTBOUND_ADAPTER;
    else process.env.SAP_OUTBOUND_ADAPTER = original;
  });

  it("defaults to service layer and honours SAP_OUTBOUND_ADAPTER=mock", () => {
    delete process.env.SAP_OUTBOUND_ADAPTER;
    expect(resolveSapOutboundPort()).toBe(serviceLayerSapOutbound);
    process.env.SAP_OUTBOUND_ADAPTER = "mock";
    expect(resolveSapOutboundPort()).toBe(mockSapOutbound);
  });
});

describe("service layer pull-out", () => {
  it("completes a pull-out job via the mock adapter", async () => {
    const pullout = { id: "j9", jobType: "pullout_itr", referenceType: "Other", referenceId: "p1" } as SapIntegrationJob;
    const ref = await serviceLayerSapOutbound.createPulloutItr({ tenantId: "t1", job: pullout });
    expect(ref).toMatch(/^SAP-/);
    expect(sapIntegrationRepository.markCompleted).toHaveBeenCalledWith("j9", ref);
  });
});
