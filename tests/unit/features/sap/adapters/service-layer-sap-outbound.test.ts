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
      branchDelivery: { findFirst: jest.fn() },
      deliveryTransfer: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      deliveryReturnRequest: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
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
jest.mock("@/features/logistics/services/delivery-return-completion", () => ({
  completeDeliveryReturn: jest.fn(),
}));
jest.mock("@/features/sap/services/sap-service-layer-client", () => ({
  sapServiceLayerClient: { request: jest.fn() },
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
import { completeDeliveryReturn } from "@/features/logistics/services/delivery-return-completion";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
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

  it("keeps a stored SO type when the dealer's mode of payment changed after approval", async () => {
    mockPrisma.branchOrder.findFirst.mockResolvedValue(order({ sapDocType: "SO" }));
    // Dealer switched to consignment, then lost its type entirely: neither re-routes the order.
    for (const kind of ["CONSIGNMENT", null] as const) {
      post.mockClear();
      routingCtx.mockResolvedValue(ctx(kind));
      post.mockResolvedValue({ docEntry: 22, docNum: 900, docDate: "2026-10-21", displayNo: "900", lineNums: [0, 1] });
      await expect(
        serviceLayerSapOutbound.createApprovedOrderDocument({ tenantId: "t1", job }),
      ).resolves.toBe("SO-900");
      const [, docKind, , body] = post.mock.calls[0];
      expect(docKind).toBe("SO");
      expect(body.CardCode).toBe("C100");
    }
  });

  it("keeps a stored ITR type without reading the mode of payment", async () => {
    mockPrisma.branchOrder.findFirst.mockResolvedValue(order({ sapDocType: "ITR" }));
    routingCtx.mockResolvedValue(ctx(null));
    post.mockResolvedValue({ docEntry: 11, docNum: 501, docDate: "2026-10-21", displayNo: "501", lineNums: [0, 1] });
    await expect(serviceLayerSapOutbound.createApprovedOrderDocument({ tenantId: "t1", job })).resolves.toBe(
      "ITR-501",
    );
    expect(post.mock.calls[0][3]).toMatchObject({ FromWarehouse: "WH1", ToWarehouse: "BR1" });
  });

  it("refuses a stored SO when the dealer has no SAP customer code", async () => {
    mockPrisma.branchOrder.findFirst.mockResolvedValue(order({ sapDocType: "SO" }));
    const noCard = ctx("OUTRIGHT");
    noCard.branch.dealer.sapCode = null as unknown as string;
    routingCtx.mockResolvedValue(noCard);
    await expect(
      serviceLayerSapOutbound.createApprovedOrderDocument({ tenantId: "t1", job }),
    ).rejects.toThrow("Dealer Dealer has no SAP customer code.");
    expect(post).not.toHaveBeenCalled();
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

describe("serviceLayerSapOutbound.createDeliveryTransferDocument", () => {
  const transferJob = { id: "j9", referenceId: "tr1" } as SapIntegrationJob;
  const transferPrisma = dbClient.prisma as unknown as {
    deliveryTransfer: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  };

  function transfer(over: Record<string, unknown> = {}) {
    return {
      transferNo: "UTR-1",
      status: "IN_TRANSIT",
      sapDocEntry: null,
      sapDocNo: null,
      releaseBranch: { sapCode: "BR1" },
      releaseWarehouse: null,
      receiveBranch: null,
      receiveWarehouse: { code: "MAIN" },
      lines: [
        { serialNumber: { serialNo: "SN2" }, model: { skuCode: "SKU-B" } },
        { serialNumber: { serialNo: "SN1" }, model: { skuCode: "SKU-A" } },
        { serialNumber: { serialNo: "SN3" }, model: { skuCode: "SKU-A" } },
      ],
      ...over,
    };
  }

  it("posts an IT from the release code to the receive code and saves the SAP number", async () => {
    transferPrisma.deliveryTransfer.findFirst.mockResolvedValue(transfer());
    post.mockResolvedValue({ docEntry: 31, docNum: 700, docDate: "2026-10-21", displayNo: "700", lineNums: [] });

    const ref = await serviceLayerSapOutbound.createDeliveryTransferDocument({
      tenantId: "t1",
      userId: "u1",
      job: transferJob,
    });

    expect(ref).toBe("IT-700");
    const [, kind, ismsRef, body] = post.mock.calls[0];
    expect(kind).toBe("IT");
    expect(ismsRef).toBe("UTR-1");
    expect(body).toMatchObject({ U_ISMS_PO_No: "UTR-1", FromWarehouse: "BR1", ToWarehouse: "MAIN" });
    const lines = (body as { StockTransferLines: Record<string, unknown>[] }).StockTransferLines;
    expect(lines.map((l) => [l.ItemCode, l.Quantity])).toEqual([
      ["SKU-A", 2],
      ["SKU-B", 1],
    ]);
    expect(lines[0]).not.toHaveProperty("BaseEntry");
    expect(transferPrisma.deliveryTransfer.update).toHaveBeenCalledWith({
      where: { id: "tr1" },
      data: { sapDocEntry: 31, sapDocNo: "700", sapDocDate: new Date("2026-10-21"), sapError: null },
    });
    expect(sapIntegrationRepository.markCompleted).toHaveBeenCalledWith("j9", "IT-700");
  });

  it("uses the warehouse code on release and the branch code on receive", async () => {
    transferPrisma.deliveryTransfer.findFirst.mockResolvedValue(
      transfer({
        releaseBranch: null,
        releaseWarehouse: { code: "WH2" },
        receiveBranch: { sapCode: "BR9" },
        receiveWarehouse: null,
      }),
    );
    post.mockResolvedValue({ docEntry: 1, docNum: 1, docDate: "2026-10-21", displayNo: "1", lineNums: [] });
    await serviceLayerSapOutbound.createDeliveryTransferDocument({ tenantId: "t1", job: transferJob });
    expect(post.mock.calls[0][3]).toMatchObject({ FromWarehouse: "WH2", ToWarehouse: "BR9" });
  });

  it("saves sapError on the transfer and rethrows when SAP refuses", async () => {
    transferPrisma.deliveryTransfer.findFirst.mockResolvedValue(transfer());
    post.mockRejectedValue(new Error("Serial SN1 not in BR1"));

    await expect(
      serviceLayerSapOutbound.createDeliveryTransferDocument({ tenantId: "t1", job: transferJob }),
    ).rejects.toThrow("Serial SN1 not in BR1");
    expect(transferPrisma.deliveryTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: "tr1", tenantId: "t1", status: "IN_TRANSIT" },
      data: { sapError: "Serial SN1 not in BR1" },
    });
    expect(transferPrisma.deliveryTransfer.update).not.toHaveBeenCalled();
    expect(sapIntegrationRepository.markCompleted).not.toHaveBeenCalled();
  });
});

describe("serviceLayerSapOutbound.createDeliveryTransferDocument guards", () => {
  const transferJob = { id: "j9", referenceId: "tr1" } as SapIntegrationJob;
  const transferPrisma = dbClient.prisma as unknown as {
    deliveryTransfer: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  };
  const base = {
    transferNo: "UTR-1",
    releaseBranch: { sapCode: "BR1" },
    releaseWarehouse: null,
    receiveBranch: null,
    receiveWarehouse: { code: "MAIN" },
    lines: [{ serialNumber: { serialNo: "SN1" }, model: { skuCode: "SKU-A" } }],
  };

  it("refuses a transfer that is not in transit (cancelled), without posting", async () => {
    transferPrisma.deliveryTransfer.findFirst.mockResolvedValue({
      ...base,
      status: "CANCELLED",
      sapDocEntry: null,
      sapDocNo: null,
    });
    await expect(
      serviceLayerSapOutbound.createDeliveryTransferDocument({ tenantId: "t1", job: transferJob }),
    ).rejects.toThrow("Only a unit transfer in transit can be posted to SAP");
    expect(post).not.toHaveBeenCalled();
    // The cancelled transfer is not marked as failed.
    expect(transferPrisma.deliveryTransfer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tr1", tenantId: "t1", status: "IN_TRANSIT" } }),
    );
  });

  it("marks the job done without re-posting when SAP already has the IT", async () => {
    transferPrisma.deliveryTransfer.findFirst.mockResolvedValue({
      ...base,
      status: "IN_TRANSIT",
      sapDocEntry: 31,
      sapDocNo: "700",
    });
    await expect(
      serviceLayerSapOutbound.createDeliveryTransferDocument({ tenantId: "t1", job: transferJob }),
    ).resolves.toBe("IT-700");
    expect(post).not.toHaveBeenCalled();
    expect(sapIntegrationRepository.markCompleted).toHaveBeenCalledWith("j9", "IT-700");
  });
});

describe("serviceLayerSapOutbound.createDeliveryReturnDocument", () => {
  const returnJob = { id: "j7", referenceId: "r1" } as SapIntegrationJob;
  const returnPrisma = dbClient.prisma as unknown as {
    deliveryReturnRequest: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  };
  const slRequest = sapServiceLayerClient.request as jest.Mock;
  const complete = completeDeliveryReturn as jest.Mock;

  function returnRequest(sapDocType: "ITR" | "SO", over: Record<string, unknown> = {}) {
    return {
      requestNo: "RTN-1",
      status: "APPROVED",
      sapDocNo: null,
      lines: [
        { serialNumber: { serialNo: "SN1", model: { skuCode: "SKU-A" } } },
        { serialNumber: { serialNo: "SN2", model: { skuCode: "SKU-B" } } },
        { serialNumber: { serialNo: "SN3", model: { skuCode: "SKU-A" } } },
      ],
      delivery: {
        sapDocEntry: 44,
        drNo: "DR-44",
        sourceWarehouse: { code: "MAIN" },
        branch: { sapCode: "BR1", dealer: { sapCode: "C001" } },
        order: { sapDocType },
      },
      ...over,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    getCreds.mockResolvedValue({ id: "c1" });
    post.mockResolvedValue({ docEntry: 81, docNum: 900, docDate: "2026-10-21", displayNo: "900", lineNums: [] });
  });

  it("posts an IT from the branch back to the source warehouse for a consignment delivery", async () => {
    returnPrisma.deliveryReturnRequest.findFirst.mockResolvedValue(returnRequest("ITR"));

    const ref = await serviceLayerSapOutbound.createDeliveryReturnDocument({ tenantId: "t1", userId: "u2", job: returnJob });

    expect(ref).toBe("IT-900");
    const [, kind, ismsRef, body] = post.mock.calls[0];
    expect(kind).toBe("IT");
    expect(ismsRef).toBe("RTN-1");
    expect(body).toMatchObject({ U_ISMS_PO_No: "RTN-1", FromWarehouse: "BR1", ToWarehouse: "MAIN" });
    const lines = (body as { StockTransferLines: Record<string, unknown>[] }).StockTransferLines;
    expect(lines.map((l) => [l.ItemCode, l.Quantity])).toEqual([
      ["SKU-A", 2],
      ["SKU-B", 1],
    ]);
    expect(lines[0]).not.toHaveProperty("BaseEntry");
    expect(slRequest).not.toHaveBeenCalled();
    expect(returnPrisma.deliveryReturnRequest.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { sapDocEntry: 81, sapDocNo: "900", sapDocDate: new Date("2026-10-21"), sapError: null },
    });
    expect(complete).toHaveBeenCalledWith({ tenantId: "t1", userId: "u2", returnId: "r1", kind: "IT", sapDocNo: "900" });
    expect(sapIntegrationRepository.markCompleted).toHaveBeenCalledWith("j7", "IT-900");
    // The local move runs only after SAP has the document and the reference is saved.
    expect(returnPrisma.deliveryReturnRequest.update.mock.invocationCallOrder[0]).toBeLessThan(
      complete.mock.invocationCallOrder[0],
    );
  });

  it("posts a Return based on the DR, mapping each serial to its DR line, for an outright delivery", async () => {
    returnPrisma.deliveryReturnRequest.findFirst.mockResolvedValue(returnRequest("SO"));
    slRequest.mockResolvedValue({
      statusCode: 200,
      rawBody: "",
      data: {
        DocEntry: 44,
        DocumentLines: [
          { LineNum: 0, ItemCode: "SKU-A", SerialNumbers: [{ InternalSerialNumber: "SN1" }, { InternalSerialNumber: "SN3" }] },
          { LineNum: 1, ItemCode: "SKU-B", SerialNumbers: [{ InternalSerialNumber: "SN2" }] },
        ],
      },
    });

    const ref = await serviceLayerSapOutbound.createDeliveryReturnDocument({ tenantId: "t1", job: returnJob });

    expect(ref).toBe("RETURN-900");
    expect(slRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "GET", path: "/DeliveryNotes(44)?$select=DocEntry,DocumentLines" }),
    );
    const [, kind, , body] = post.mock.calls[0];
    expect(kind).toBe("RETURN");
    expect(body).toMatchObject({ U_ISMS_PO_No: "RTN-1", CardCode: "C001" });
    const lines = (body as { DocumentLines: Record<string, unknown>[] }).DocumentLines;
    expect(lines).toEqual([
      expect.objectContaining({ ItemCode: "SKU-A", WarehouseCode: "MAIN", Quantity: 2, BaseType: 15, BaseEntry: 44, BaseLine: 0 }),
      expect.objectContaining({ ItemCode: "SKU-B", WarehouseCode: "MAIN", Quantity: 1, BaseType: 15, BaseEntry: 44, BaseLine: 1 }),
    ]);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ kind: "RETURN", sapDocNo: "900" }));
  });

  it("refuses a serial that is not on the DR in SAP and saves the error", async () => {
    returnPrisma.deliveryReturnRequest.findFirst.mockResolvedValue(returnRequest("SO"));
    slRequest.mockResolvedValue({
      statusCode: 200,
      rawBody: "",
      data: { DocumentLines: [{ LineNum: 0, ItemCode: "SKU-A", SerialNumbers: [{ InternalSerialNumber: "SN1" }] }] },
    });

    await expect(
      serviceLayerSapOutbound.createDeliveryReturnDocument({ tenantId: "t1", job: returnJob }),
    ).rejects.toThrow("Serial SN2 is not on DR# DR-44 in SAP");
    expect(post).not.toHaveBeenCalled();
    expect(returnPrisma.deliveryReturnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", tenantId: "t1", status: "APPROVED" },
      data: { sapError: "Serial SN2 is not on DR# DR-44 in SAP" },
    });
  });

  it("saves sapError on the request and rethrows when SAP refuses, without moving units", async () => {
    returnPrisma.deliveryReturnRequest.findFirst.mockResolvedValue(returnRequest("ITR"));
    post.mockRejectedValue(new Error("Serial SN1 not in BR1"));

    await expect(
      serviceLayerSapOutbound.createDeliveryReturnDocument({ tenantId: "t1", job: returnJob }),
    ).rejects.toThrow("Serial SN1 not in BR1");
    expect(returnPrisma.deliveryReturnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", tenantId: "t1", status: "APPROVED" },
      data: { sapError: "Serial SN1 not in BR1" },
    });
    expect(returnPrisma.deliveryReturnRequest.update).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(sapIntegrationRepository.markCompleted).not.toHaveBeenCalled();
  });

  it("says SAP posted when only the local move failed, and only touches an APPROVED request", async () => {
    returnPrisma.deliveryReturnRequest.findFirst.mockResolvedValue(returnRequest("ITR"));
    complete.mockRejectedValueOnce(new Error("Unit SN3 is on transfer UTR-9"));

    await expect(
      serviceLayerSapOutbound.createDeliveryReturnDocument({ tenantId: "t1", job: returnJob }),
    ).rejects.toThrow("SAP posted IT 900; moving units failed: Unit SN3 is on transfer UTR-9");
    expect(returnPrisma.deliveryReturnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", tenantId: "t1", status: "APPROVED" },
      data: { sapError: "SAP posted IT 900; moving units failed: Unit SN3 is on transfer UTR-9" },
    });
    expect(sapIntegrationRepository.markCompleted).not.toHaveBeenCalled();
  });

  it("refuses a cancelled or undecided return without posting", async () => {
    for (const status of ["CANCELLED", "PENDING_APPROVAL"]) {
      returnPrisma.deliveryReturnRequest.findFirst.mockResolvedValue(returnRequest("ITR", { status }));
      await expect(
        serviceLayerSapOutbound.createDeliveryReturnDocument({ tenantId: "t1", job: returnJob }),
      ).rejects.toThrow("Only an approved return can be posted to SAP");
    }
    expect(post).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(sapIntegrationRepository.markCompleted).not.toHaveBeenCalled();
  });

  it("marks the job done without posting or writing sapError for a completed request", async () => {
    returnPrisma.deliveryReturnRequest.findFirst.mockResolvedValue(
      returnRequest("SO", { status: "COMPLETED", sapDocNo: "900" }),
    );
    const ref = await serviceLayerSapOutbound.createDeliveryReturnDocument({ tenantId: "t1", job: returnJob });
    expect(ref).toBe("RETURN-900");
    expect(post).not.toHaveBeenCalled();
    expect(returnPrisma.deliveryReturnRequest.updateMany).not.toHaveBeenCalled();
    expect(sapIntegrationRepository.markCompleted).toHaveBeenCalledWith("j7", "RETURN-900");
  });
});
