jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) => Boolean(permissions?.includes(slug)),
}));
jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    deliveryReturnRequest: { count: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    deliveryTransferLine: { findMany: jest.fn() },
    deliveryReturnLine: { findMany: jest.fn() },
    branchDelivery: { findFirst: jest.fn() },
    branchInventory: { count: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      deliveryReturnRequest: { count: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
      deliveryTransferLine: { findMany: jest.fn() },
      deliveryReturnLine: { findMany: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/features/audit/services/audit.service", () => ({ auditService: { log: jest.fn() } }));
jest.mock("@/features/inventory/services/serial-placement", () => ({ lockSerialNumbers: jest.fn() }));
jest.mock("@/features/logistics/services/delivery-scope", () => ({ authorizeDeliveryScope: jest.fn() }));
jest.mock("@/features/logistics/services/delivery-posting.service", () => ({ loadDelivery: jest.fn() }));
jest.mock("@/features/logistics/services/delivery-return-completion", () => ({
  DELIVERY_RETURN_ENTITY: "DeliveryReturnRequest",
}));
jest.mock("@/features/sap/adapters/resolve-sap-outbound", () => ({ resolveSapOutboundPort: jest.fn() }));
jest.mock("@/features/sap/services/sap.service", () => ({
  sapService: { emitDeliveryReturn: jest.fn(), processPendingJobs: jest.fn() },
}));
jest.mock("@/features/sap/repositories/sap-integration.repository", () => ({
  sapIntegrationRepository: {
    requeueByReference: jest.fn(),
    deadLetterByReference: jest.fn(),
    countInFlight: jest.fn(),
  },
}));
jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: { requireCodeId: jest.fn() },
}));

import * as dbClient from "@/lib/database/client";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { loadDelivery } from "@/features/logistics/services/delivery-posting.service";
import { deliveryReturnService } from "@/features/logistics/services/delivery-return.service";
import { authorizeDeliveryScope } from "@/features/logistics/services/delivery-scope";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";
import { sapService } from "@/features/sap/services/sap.service";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;
const mockPrisma = dbClient.prisma as unknown as Mocks;
const queryRaw = () => mockTx.$queryRaw as unknown as jest.Mock;
const emit = sapService.emitDeliveryReturn as jest.Mock;
const processJobs = sapService.processPendingJobs as jest.Mock;

const requester = { tenantId: "t1", userId: "u1", permissions: ["logistics.delivery_return.request"] };
const approver = { tenantId: "t1", userId: "u2", permissions: ["logistics.delivery_return.approve"] };

function partialDelivery() {
  return {
    id: "del1",
    branchId: "b1",
    sourceWarehouseId: "w1",
    sapDocEntry: 9,
    drNo: "DR-9",
    orderSapDocType: "ITR",
    status: "partial",
    requirements: [],
    lines: [
      { serialNumberId: "s1", warehouseLocationFromId: "loc1", branchStatus: "STK" },
      { serialNumberId: "s2", warehouseLocationFromId: "loc1", branchStatus: "DIT" },
      { serialNumberId: "s3", warehouseLocationFromId: "loc2", branchStatus: "DIT" },
    ],
  };
}

function scopedReturn(status = "PENDING_APPROVAL", sapDocEntry: number | null = null) {
  return {
    id: "r1",
    requestNo: "RTN-1",
    status,
    sapDocEntry,
    delivery: { branchId: "b1", sourceWarehouseId: "w1" },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadDelivery as jest.Mock).mockResolvedValue(partialDelivery());
  mockPrisma.deliveryReturnRequest.count.mockResolvedValue(0);
  mockPrisma.deliveryTransferLine.findMany.mockResolvedValue([]);
  mockTx.deliveryReturnRequest.count.mockResolvedValue(0);
  mockTx.deliveryTransferLine.findMany.mockResolvedValue([]);
  mockPrisma.deliveryReturnLine.findMany.mockResolvedValue([]);
  mockTx.deliveryReturnLine.findMany.mockResolvedValue([]);
  mockTx.branchDelivery.findFirst.mockResolvedValue({ statusCode: { code: "partial" } });
  mockTx.branchInventory.count.mockResolvedValue(2);
  mockTx.deliveryReturnRequest.create.mockResolvedValue({ id: "r1", requestNo: "RTN-1" });
  mockTx.deliveryReturnRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe("deliveryReturnService.request", () => {
  it("creates a pending request for the in-transit units only, under serial then delivery locks", async () => {
    const row = await deliveryReturnService.request(requester, { deliveryId: "del1", reason: "  Wrong model  " });

    expect(row).toEqual({ id: "r1", requestNo: "RTN-1" });
    expect(authorizeDeliveryScope).toHaveBeenCalledWith(requester, expect.objectContaining({ branchId: "b1" }));
    expect(lockSerialNumbers).toHaveBeenCalledWith(mockTx, ["s2", "s3"]);
    const lock = queryRaw().mock.calls[0];
    expect((lock[0] as TemplateStringsArray).join("?")).toMatch(/FROM branch_deliveries [\s\S]*FOR UPDATE/);
    expect((lockSerialNumbers as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      queryRaw().mock.invocationCallOrder[0],
    );
    const data = mockTx.deliveryReturnRequest.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "t1",
      deliveryId: "del1",
      reason: "Wrong model",
      requestedById: "u1",
      lines: {
        create: [
          { serialNumberId: "s2", warehouseLocationToId: "loc1" },
          { serialNumberId: "s3", warehouseLocationToId: "loc2" },
        ],
      },
    });
    expect(data.requestNo).toMatch(/^RTN-[0-9A-Z]+$/);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "delivery_return.requested" }) }),
    );
  });

  it("rejects only the ticked units; blank remarks fall back to the defaults", async () => {
    mockTx.branchInventory.count.mockResolvedValue(1);
    await deliveryReturnService.request(requester, {
      deliveryId: "del1",
      reason: "   ",
      units: [{ serialNumberId: "s3", remarks: "  Cracked screen " }],
    });
    expect(mockTx.deliveryReturnRequest.create.mock.calls[0][0].data).toMatchObject({
      reason: "Rejected at branch receiving",
      lines: { create: [{ serialNumberId: "s3", warehouseLocationToId: "loc2", remarks: "Cracked screen" }] },
    });
  });

  it("a unit without its own remarks carries the request remarks", async () => {
    await deliveryReturnService.request(requester, {
      deliveryId: "del1",
      reason: "Wrong model",
      units: [{ serialNumberId: "s2" }, { serialNumberId: "s3", remarks: "" }],
    });
    expect(mockTx.deliveryReturnRequest.create.mock.calls[0][0].data.lines.create).toEqual([
      { serialNumberId: "s2", warehouseLocationToId: "loc1", remarks: "Wrong model" },
      { serialNumberId: "s3", warehouseLocationToId: "loc2", remarks: "Wrong model" },
    ]);
  });

  it("needs the request capability", async () => {
    await expect(
      deliveryReturnService.request({ ...requester, permissions: [] }, { deliveryId: "del1", reason: "x" }),
    ).rejects.toThrow("You do not have permission to request delivery returns");
  });

  it("refuses while a DIT unit is on an open unit transfer (R9)", async () => {
    mockPrisma.deliveryTransferLine.findMany.mockResolvedValue([
      { serialNumberId: "s3", serialNumber: { serialNo: "SN3" }, transfer: { id: "tr1", transferNo: "UTR-1" } },
    ]);
    await expect(deliveryReturnService.request(requester, { deliveryId: "del1", reason: "x" })).rejects.toThrow(
      "Finish or remove the open unit transfer first.",
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a delivery whose order was approved before SAP posting (no SAP type)", async () => {
    (loadDelivery as jest.Mock).mockResolvedValue({ ...partialDelivery(), orderSapDocType: null });
    await expect(deliveryReturnService.request(requester, { deliveryId: "del1", reason: "x" })).rejects.toThrow(
      "This delivery was dispatched before SAP posting was enabled. Receive its units instead.",
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("allows an outright (SO) delivery without its DR in SAP: the Return is standalone", async () => {
    (loadDelivery as jest.Mock).mockResolvedValue({ ...partialDelivery(), orderSapDocType: "SO", sapDocEntry: null });
    await expect(deliveryReturnService.request(requester, { deliveryId: "del1", reason: "x" })).resolves.toEqual({
      id: "r1",
      requestNo: "RTN-1",
    });
  });

  it("allows an outright (SO) delivery with its DR", async () => {
    (loadDelivery as jest.Mock).mockResolvedValue({ ...partialDelivery(), orderSapDocType: "SO" });
    await expect(deliveryReturnService.request(requester, { deliveryId: "del1", reason: "x" })).resolves.toEqual({
      id: "r1",
      requestNo: "RTN-1",
    });
  });

  it("refuses a unit already on an open reject request, but rejects the delivery's other units", async () => {
    const held = [{ serialNumberId: "s2", serialNumber: { serialNo: "SN2" }, returnRequest: { id: "r0", requestNo: "RTN-0" } }];
    mockPrisma.deliveryReturnLine.findMany.mockResolvedValue(held);
    await expect(
      deliveryReturnService.request(requester, { deliveryId: "del1", units: [{ serialNumberId: "s2" }] }),
    ).rejects.toThrow("Some units are already waiting on a reject request");

    mockTx.branchInventory.count.mockResolvedValue(1);
    await expect(
      deliveryReturnService.request(requester, { deliveryId: "del1", units: [{ serialNumberId: "s3" }] }),
    ).resolves.toEqual({ id: "r1", requestNo: "RTN-1" });
  });

  it("re-checks the units under the serial locks", async () => {
    mockTx.deliveryReturnLine.findMany.mockResolvedValue([
      { serialNumberId: "s3", serialNumber: { serialNo: "SN3" }, returnRequest: { id: "r0", requestNo: "RTN-0" } },
    ]);
    await expect(deliveryReturnService.request(requester, { deliveryId: "del1", reason: "x" })).rejects.toThrow(
      "Some units are already waiting on a reject request",
    );
    expect(mockTx.deliveryReturnRequest.create).not.toHaveBeenCalled();
  });

  it("refuses when a unit was accepted after the plan (re-check under lock)", async () => {
    mockTx.branchInventory.count.mockResolvedValue(1);
    await expect(deliveryReturnService.request(requester, { deliveryId: "del1", reason: "x" })).rejects.toThrow(
      "This delivery changed. Reload and try again.",
    );
    expect(mockTx.deliveryReturnRequest.create).not.toHaveBeenCalled();
  });
});

describe("deliveryReturnService.decide", () => {
  it("approves by claiming PENDING_APPROVAL, then posts to SAP inline", async () => {
    mockPrisma.deliveryReturnRequest.findFirst
      .mockResolvedValueOnce(scopedReturn())
      .mockResolvedValueOnce({ status: "COMPLETED", sapDocNo: "500", sapError: null });

    const outcome = await deliveryReturnService.decide(approver, "r1", "APPROVE", " ok ");

    expect(mockTx.deliveryReturnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", tenantId: "t1", status: "PENDING_APPROVAL" },
      data: { status: "APPROVED", decidedById: "u2", decidedAt: expect.any(Date), decisionNote: "ok" },
    });
    expect(emit).toHaveBeenCalledWith("t1", { id: "r1", requestNo: "RTN-1" });
    expect(processJobs).toHaveBeenCalledWith("t1", "u2", 1, {
      referenceType: "DeliveryReturnRequest",
      referenceId: "r1",
    });
    expect(sapIntegrationRepository.requeueByReference).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "COMPLETED", sapDocNo: "500", sapError: null });
  });

  it("rejects to CANCELLED without any SAP call", async () => {
    mockPrisma.deliveryReturnRequest.findFirst
      .mockResolvedValueOnce(scopedReturn())
      .mockResolvedValueOnce({ status: "CANCELLED", sapDocNo: null, sapError: null });

    const outcome = await deliveryReturnService.decide(approver, "r1", "REJECT", null);

    expect(mockTx.deliveryReturnRequest.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "CANCELLED",
      decisionNote: null,
    });
    expect(emit).not.toHaveBeenCalled();
    expect(outcome.status).toBe("CANCELLED");
  });

  it("loses the claim when someone else decided first", async () => {
    mockPrisma.deliveryReturnRequest.findFirst.mockResolvedValueOnce(scopedReturn());
    mockTx.deliveryReturnRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(deliveryReturnService.decide(approver, "r1", "APPROVE")).rejects.toThrow(
      "This return request has already been decided",
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it("refuses a request that is no longer pending", async () => {
    mockPrisma.deliveryReturnRequest.findFirst.mockResolvedValueOnce(scopedReturn("CANCELLED"));
    await expect(deliveryReturnService.decide(approver, "r1", "APPROVE")).rejects.toThrow(
      "This return request has already been decided",
    );
  });

  it("keeps the approval and saves sapError when queueing fails", async () => {
    mockPrisma.deliveryReturnRequest.findFirst
      .mockResolvedValueOnce(scopedReturn())
      .mockResolvedValueOnce({ status: "APPROVED", sapDocNo: null, sapError: "SAP down" });
    emit.mockRejectedValueOnce(new Error("SAP down"));

    const outcome = await deliveryReturnService.decide(approver, "r1", "APPROVE");

    expect(mockPrisma.deliveryReturnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", tenantId: "t1", status: "APPROVED" },
      data: { sapError: "SAP down" },
    });
    expect(outcome).toEqual({ status: "APPROVED", sapDocNo: null, sapError: "SAP down" });
  });

  it("needs the approve capability and enforces scope", async () => {
    await expect(deliveryReturnService.decide(requester, "r1", "APPROVE")).rejects.toThrow(
      "You do not have permission to approve delivery returns",
    );
    mockPrisma.deliveryReturnRequest.findFirst.mockResolvedValueOnce(scopedReturn());
    (authorizeDeliveryScope as jest.Mock).mockRejectedValueOnce(new Error("outside"));
    await expect(deliveryReturnService.decide(approver, "r1", "APPROVE")).rejects.toThrow("outside");
  });
});

describe("deliveryReturnService.retrySap", () => {
  it("re-queues the job and runs it again", async () => {
    mockPrisma.deliveryReturnRequest.findFirst
      .mockResolvedValueOnce(scopedReturn("APPROVED"))
      .mockResolvedValueOnce({ status: "COMPLETED", sapDocNo: "501", sapError: null });

    const outcome = await deliveryReturnService.retrySap(requester, "r1");

    expect(sapIntegrationRepository.requeueByReference).toHaveBeenCalledWith("t1", "DeliveryReturnRequest", "r1");
    expect(processJobs).toHaveBeenCalledWith("t1", "u1", 1, {
      referenceType: "DeliveryReturnRequest",
      referenceId: "r1",
    });
    expect(outcome.status).toBe("COMPLETED");
  });

  it("only retries an approved return", async () => {
    mockPrisma.deliveryReturnRequest.findFirst.mockResolvedValueOnce(scopedReturn("COMPLETED"));
    await expect(deliveryReturnService.retrySap(approver, "r1")).rejects.toThrow(
      "Only an approved return waiting for SAP can be retried",
    );
  });
});

describe("deliveryReturnService.cancelApproved", () => {
  const jobsRepo = sapIntegrationRepository as unknown as Record<string, jest.Mock>;

  beforeEach(() => {
    jobsRepo.countInFlight.mockResolvedValue(0);
  });

  it("cancels an approved return SAP never took, retiring its job in the same transaction", async () => {
    mockPrisma.deliveryReturnRequest.findFirst
      .mockResolvedValueOnce(scopedReturn("APPROVED"))
      .mockResolvedValueOnce({ status: "CANCELLED", sapDocNo: null, sapError: null });

    const outcome = await deliveryReturnService.cancelApproved(approver, "r1", "  SAP DR was voided  ");

    expect(jobsRepo.deadLetterByReference).toHaveBeenCalledWith(
      "t1",
      "DeliveryReturnRequest",
      "r1",
      "Return cancelled in ISMS",
      mockTx,
    );
    expect(mockTx.deliveryReturnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", tenantId: "t1", status: "APPROVED", sapDocEntry: null },
      data: {
        status: "CANCELLED",
        decidedById: "u2",
        decidedAt: expect.any(Date),
        decisionNote: "SAP DR was voided",
        sapError: null,
      },
    });
    // The job is retired before the claim, so a worker cannot pick it up in between.
    expect(jobsRepo.deadLetterByReference.mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.deliveryReturnRequest.updateMany.mock.invocationCallOrder[0],
    );
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "delivery_return.cancelled_after_approval",
          metadata: { requestNo: "RTN-1", note: "SAP DR was voided" },
        }),
      }),
    );
    expect(emit).not.toHaveBeenCalled();
    expect(outcome.status).toBe("CANCELLED");
  });

  it("needs a note, an APPROVED status and no SAP document", async () => {
    mockPrisma.deliveryReturnRequest.findFirst.mockResolvedValueOnce(scopedReturn("APPROVED"));
    await expect(deliveryReturnService.cancelApproved(approver, "r1", "   ")).rejects.toThrow(
      "Enter the reason for cancelling the return",
    );
    mockPrisma.deliveryReturnRequest.findFirst.mockResolvedValueOnce(scopedReturn("APPROVED", 81));
    await expect(deliveryReturnService.cancelApproved(approver, "r1", "x")).rejects.toThrow(
      "SAP already has this return. It cannot be cancelled.",
    );
    mockPrisma.deliveryReturnRequest.findFirst.mockResolvedValueOnce(scopedReturn("PENDING_APPROVAL"));
    await expect(deliveryReturnService.cancelApproved(approver, "r1", "x")).rejects.toThrow(
      "Only an approved return waiting for SAP can be cancelled",
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses while a worker is posting it, and when the claim is lost", async () => {
    mockPrisma.deliveryReturnRequest.findFirst.mockResolvedValueOnce(scopedReturn("APPROVED"));
    jobsRepo.countInFlight.mockResolvedValueOnce(1);
    await expect(deliveryReturnService.cancelApproved(approver, "r1", "x")).rejects.toThrow(
      "SAP is posting this return right now. Try again in a minute.",
    );
    expect(mockTx.deliveryReturnRequest.updateMany).not.toHaveBeenCalled();

    mockPrisma.deliveryReturnRequest.findFirst.mockResolvedValueOnce(scopedReturn("APPROVED"));
    mockTx.deliveryReturnRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(deliveryReturnService.cancelApproved(approver, "r1", "x")).rejects.toThrow(
      "This return changed. Reload and try again.",
    );
  });

  it("needs the approve capability", async () => {
    await expect(deliveryReturnService.cancelApproved(requester, "r1", "x")).rejects.toThrow(
      "You do not have permission to approve delivery returns",
    );
  });
});
