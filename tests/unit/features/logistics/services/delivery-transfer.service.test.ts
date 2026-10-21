jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) => Boolean(permissions?.includes(slug)),
}));
jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    deliveryTransfer: { updateMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    deliveryTransferLine: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    branchInventory: { updateMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
    warehouseInventory: { create: jest.fn() },
    serialNumberHistory: { create: jest.fn() },
    deliveryReturnRequest: { count: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      deliveryTransfer: { findFirst: jest.fn(), updateMany: jest.fn() },
      deliveryTransferLine: { findFirst: jest.fn(), findMany: jest.fn() },
      deliveryReturnRequest: { count: jest.fn() },
      branch: { count: jest.fn() },
      warehouse: { count: jest.fn() },
      warehouseLocation: { count: jest.fn() },
      serialNumber: { findMany: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/features/audit/services/audit.service", () => ({ auditService: { log: jest.fn() } }));
jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: { requireCodeId: jest.fn(async (_t: string, _c: string, code: string) => `id-${code}`) },
}));
jest.mock("@/features/inventory/services/serial-placement", () => ({
  assertExclusivePlacement: jest.fn(),
  loadCurrentPlacements: jest.fn(),
  lockSerialNumbers: jest.fn(),
}));
jest.mock("@/features/logistics/services/delivery-scope", () => ({ authorizeDeliveryScope: jest.fn() }));
jest.mock("@/features/logistics/services/delivery-posting.service", () => ({
  finalizeDeliveryIfSettled: jest.fn(),
  loadDelivery: jest.fn(),
}));
jest.mock("@/features/sap/services/sap.service", () => ({
  sapService: { emitDeliveryTransfer: jest.fn(), processPendingJobs: jest.fn() },
}));
jest.mock("@/features/sap/repositories/sap-integration.repository", () => ({
  sapIntegrationRepository: {
    requeueByReference: jest.fn(),
    deadLetterByReference: jest.fn(),
    countInFlight: jest.fn(),
  },
}));

import { Prisma } from "@/lib/database/generated/prisma/client";
import * as dbClient from "@/lib/database/client";
import { loadCurrentPlacements } from "@/features/inventory/services/serial-placement";
import {
  finalizeDeliveryIfSettled,
  loadDelivery,
} from "@/features/logistics/services/delivery-posting.service";
import { authorizeDeliveryScope } from "@/features/logistics/services/delivery-scope";
import { deliveryTransferService } from "@/features/logistics/services/delivery-transfer.service";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";
import { sapService } from "@/features/sap/services/sap.service";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;
const mockPrisma = dbClient.prisma as unknown as Mocks;
const queryRaw = () => mockTx.$queryRaw as unknown as jest.Mock;
const emit = sapService.emitDeliveryTransfer as jest.Mock;
const processJobs = sapService.processPendingJobs as jest.Mock;
const jobsRepo = sapIntegrationRepository as unknown as Record<string, jest.Mock>;

const approver = {
  tenantId: "t1",
  userId: "u1",
  permissions: ["logistics.delivery_transfer.approve", "logistics.delivery_transfer.receive"],
};

function scopedTransfer(sapDocType: "ITR" | "SO" | null, status = "PENDING_APPROVAL", sapDocEntry: number | null = null) {
  return {
    id: "tr1",
    transferNo: "UTR-1",
    status,
    sapDocEntry,
    deliveryId: "del1",
    delivery: { branchId: "b1", sourceWarehouseId: "w1", order: { sapDocType } },
  };
}

/** The header lock is the first statement of the transaction, before any read. */
function expectHeaderLockedFirst(firstRead: jest.Mock) {
  const lock = queryRaw().mock.calls[0];
  expect(lock).toBeDefined();
  expect((lock[0] as TemplateStringsArray).join("?")).toMatch(/FROM delivery_transfers [\s\S]*FOR UPDATE/);
  expect(lock.slice(1)).toEqual(["tr1", "t1"]);
  expect(queryRaw().mock.invocationCallOrder[0]).toBeLessThan(firstRead.mock.invocationCallOrder[0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  queryRaw().mockResolvedValue([{ id: "tr1" }]);
  mockTx.deliveryTransfer.findFirst.mockResolvedValue({ status: "PENDING_APPROVAL" });
  mockTx.deliveryTransferLine.findMany.mockResolvedValue([{ status: "APPROVED" }, { status: "REMOVED" }]);
  mockTx.deliveryTransfer.updateMany.mockResolvedValue({ count: 1 });
});

describe("deliveryTransferService.release", () => {
  it("queues and runs the SAP IT for a consignment (ITR) delivery", async () => {
    mockPrisma.deliveryTransfer.findFirst
      .mockResolvedValueOnce(scopedTransfer("ITR"))
      .mockResolvedValueOnce({ sapDocNo: "700", sapError: null });

    const result = await deliveryTransferService.release(approver, "tr1");

    expect(authorizeDeliveryScope).toHaveBeenCalledWith(approver, expect.objectContaining({ branchId: "b1" }));
    expect(mockTx.deliveryTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: "tr1", tenantId: "t1", status: "PENDING_APPROVAL" },
      data: { status: "IN_TRANSIT" },
    });
    expectHeaderLockedFirst(mockTx.deliveryTransfer.findFirst);
    expect(emit).toHaveBeenCalledWith("t1", { id: "tr1", transferNo: "UTR-1" });
    expect(processJobs).toHaveBeenCalledWith("t1", "u1", 1, { referenceType: "DeliveryTransfer", referenceId: "tr1" });
    expect(result).toEqual({ sapDocNo: "700", sapError: null });
  });

  it("posts nothing to SAP for an outright (SO) delivery", async () => {
    mockPrisma.deliveryTransfer.findFirst
      .mockResolvedValueOnce(scopedTransfer("SO"))
      .mockResolvedValueOnce({ sapDocNo: null, sapError: null });
    await deliveryTransferService.release(approver, "tr1");
    expect(emit).not.toHaveBeenCalled();
  });

  it("keeps the release when SAP queueing fails and records sapError", async () => {
    mockPrisma.deliveryTransfer.findFirst
      .mockResolvedValueOnce(scopedTransfer("ITR"))
      .mockResolvedValueOnce({ sapDocNo: null, sapError: "SAP down" });
    emit.mockRejectedValueOnce(new Error("SAP down"));

    const result = await deliveryTransferService.release(approver, "tr1");

    expect(mockPrisma.deliveryTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: "tr1", tenantId: "t1", status: "IN_TRANSIT" },
      data: { sapError: "SAP down" },
    });
    expect(result.sapError).toBe("SAP down");
    expect(jobsRepo.requeueByReference).not.toHaveBeenCalled();
  });

  it("refuses while a line is still pending", async () => {
    mockPrisma.deliveryTransfer.findFirst.mockResolvedValueOnce(scopedTransfer("ITR"));
    mockTx.deliveryTransferLine.findMany.mockResolvedValue([{ status: "PENDING" }, { status: "APPROVED" }]);
    await expect(deliveryTransferService.release(approver, "tr1")).rejects.toThrow(
      "Approve or delete every pending line before releasing",
    );
    expect(mockTx.deliveryTransfer.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when the header re-read under the lock is no longer pending approval", async () => {
    mockPrisma.deliveryTransfer.findFirst.mockResolvedValueOnce(scopedTransfer("ITR"));
    mockTx.deliveryTransfer.findFirst.mockResolvedValue({ status: "IN_TRANSIT" });
    await expect(deliveryTransferService.release(approver, "tr1")).rejects.toThrow(
      "This transfer has already been released",
    );
  });

  it("requires the approve capability", async () => {
    await expect(
      deliveryTransferService.release({ ...approver, permissions: ["logistics.delivery_transfer.create"] }, "tr1"),
    ).rejects.toThrow("You do not have permission to approve unit transfers");
  });
});

describe("deliveryTransferService.receiveLine", () => {
  function lineRow(receive: "BRANCH" | "WAREHOUSE") {
    return {
      status: "APPROVED",
      serialNumberId: "s1",
      transfer: {
        status: "IN_TRANSIT",
        transferNo: "UTR-1",
        sapDocEntry: 31 as number | null,
        sapError: null as string | null,
        deliveryId: "del1",
        receiveBranchId: receive === "BRANCH" ? "b2" : null,
        receiveWarehouseLocationId: receive === "WAREHOUSE" ? "loc1" : null,
        releaseBranch: { name: "Branch One" },
        releaseWarehouse: null,
        receiveBranch: receive === "BRANCH" ? { name: "Branch Two" } : null,
        receiveWarehouse: receive === "WAREHOUSE" ? { name: "Main" } : null,
        receiveWarehouseLocation: receive === "WAREHOUSE" ? { code: "A-01" } : null,
      },
    };
  }

  beforeEach(() => {
    mockPrisma.deliveryTransferLine.findFirst.mockResolvedValue({ id: "l1", transferId: "tr1" });
    mockPrisma.deliveryTransfer.findFirst.mockResolvedValue(scopedTransfer("ITR", "IN_TRANSIT"));
    (loadCurrentPlacements as jest.Mock).mockResolvedValue([
      { table: "branch", id: "bi1", serialNumberId: "s1", branchId: "b1", statusCode: "DIT" },
    ]);
    mockTx.deliveryTransferLine.updateMany.mockResolvedValue({ count: 1 });
    mockTx.deliveryTransferLine.findMany.mockResolvedValue([{ status: "RECEIVED" }]);
  });

  it("moves the unit into the receiving warehouse location and completes the transfer", async () => {
    mockTx.deliveryTransferLine.findFirst.mockResolvedValue(lineRow("WAREHOUSE"));
    mockTx.branchInventory.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deliveryTransferService.receiveLine(approver, "l1");

    expectHeaderLockedFirst(mockTx.deliveryTransferLine.findFirst);
    expect(mockTx.branchInventory.deleteMany).toHaveBeenCalledWith({ where: { id: "bi1", statusCodeId: "id-DIT" } });
    expect(mockTx.warehouseInventory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serialNumberId: "s1",
        warehouseLocationId: "loc1",
        systemStatus: "Received from unit transfer",
      }),
    });
    expect(mockTx.serialNumberHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        txnType: "transfer",
        details: "Received on UTR-1 at Main (A-01)",
        status: "Warehouse",
      }),
    });
    expect(mockTx.deliveryTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: "tr1", status: "IN_TRANSIT" },
      data: { status: "COMPLETED" },
    });
    expect(finalizeDeliveryIfSettled).toHaveBeenCalledWith(mockTx, "t1", "del1");
    expect(result).toEqual({ transferId: "tr1", status: "COMPLETED" });
  });

  it("moves the branch row to the receiving branch as STK", async () => {
    mockTx.deliveryTransferLine.findFirst.mockResolvedValue(lineRow("BRANCH"));
    mockTx.branchInventory.updateMany.mockResolvedValue({ count: 1 });

    await deliveryTransferService.receiveLine(approver, "l1");

    expect(mockTx.branchInventory.updateMany).toHaveBeenCalledWith({
      where: { id: "bi1", statusCodeId: "id-DIT" },
      data: { branchId: "b2", statusCodeId: "id-STK", updatedById: "u1" },
    });
    expect(mockTx.warehouseInventory.create).not.toHaveBeenCalled();
  });

  it("refuses a consignment receive until the SAP IT has posted", async () => {
    const row = lineRow("BRANCH");
    row.transfer.sapDocEntry = null;
    row.transfer.sapError = "Serial SN1 not in BR1";
    mockTx.deliveryTransferLine.findFirst.mockResolvedValue(row);
    await expect(deliveryTransferService.receiveLine(approver, "l1")).rejects.toThrow(
      "SAP transfer not posted yet: Serial SN1 not in BR1. Use Retry SAP posting below.",
    );
    row.transfer.sapError = null;
    await expect(deliveryTransferService.receiveLine(approver, "l1")).rejects.toThrow(
      "SAP transfer not posted yet. Use Retry SAP posting below.",
    );
    expect(mockTx.branchInventory.updateMany).not.toHaveBeenCalled();
  });

  it("lets an outright (SO) receive go ahead without an SAP document", async () => {
    mockPrisma.deliveryTransfer.findFirst.mockResolvedValue(scopedTransfer("SO", "IN_TRANSIT"));
    const row = lineRow("BRANCH");
    row.transfer.sapDocEntry = null;
    mockTx.deliveryTransferLine.findFirst.mockResolvedValue(row);
    mockTx.branchInventory.updateMany.mockResolvedValue({ count: 1 });
    await expect(deliveryTransferService.receiveLine(approver, "l1")).resolves.toMatchObject({ transferId: "tr1" });
  });

  it("refuses when the unit is no longer in transit at the delivery branch", async () => {
    mockTx.deliveryTransferLine.findFirst.mockResolvedValue(lineRow("BRANCH"));
    (loadCurrentPlacements as jest.Mock).mockResolvedValue([
      { table: "branch", id: "bi1", serialNumberId: "s1", branchId: "b1", statusCode: "STK" },
    ]);
    await expect(deliveryTransferService.receiveLine(approver, "l1")).rejects.toThrow(
      "This unit is no longer in transit at the delivery branch",
    );
  });
});

describe("deliveryTransferService.create", () => {
  const creator = { tenantId: "t1", userId: "u1", permissions: ["logistics.delivery_transfer.create"] };

  beforeEach(() => {
    (loadDelivery as jest.Mock).mockResolvedValue({
      id: "del1",
      branchId: "b1",
      sourceWarehouseId: "w1",
      status: "partial",
      lines: [{ serialNumberId: "s1", warehouseLocationFromId: "loc1", branchStatus: "DIT" }],
      requirements: [],
    });
    mockPrisma.deliveryReturnRequest.count.mockResolvedValue(0);
    mockTx.deliveryReturnRequest.count.mockResolvedValue(0);
    mockPrisma.deliveryTransferLine.findMany.mockResolvedValue([]);
    mockTx.deliveryTransferLine.findMany.mockResolvedValue([]);
    mockPrisma.branch.count.mockResolvedValue(1);
    mockPrisma.warehouse.count.mockResolvedValue(1);
    mockPrisma.warehouseLocation.count.mockResolvedValue(1);
    mockPrisma.serialNumber.findMany.mockResolvedValue([{ id: "s1", modelId: "m1" }]);
    mockTx.branchInventory.count.mockResolvedValue(1);
  });

  const input = {
    deliveryId: "del1",
    release: { kind: "BRANCH" as const, id: "b1" },
    receive: { kind: "WAREHOUSE" as const, id: "w1", locationId: "loc1" },
    lines: [{ serialNumberId: "s1", remarks: " cracked screen " }],
  };

  it("refuses under the delivery row lock when a return opened after the first check", async () => {
    mockTx.deliveryReturnRequest.count.mockResolvedValue(1);
    await expect(deliveryTransferService.create(creator, input)).rejects.toThrow(
      "This delivery has an open return request. Finish it before creating a transfer.",
    );
    const lockCall = queryRaw().mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join("?").includes("FROM branch_deliveries"),
    );
    expect(lockCall).toBeDefined();
    const lockIndex = queryRaw().mock.calls.indexOf(lockCall!);
    expect(queryRaw().mock.invocationCallOrder[lockIndex]).toBeLessThan(
      mockTx.deliveryReturnRequest.count.mock.invocationCallOrder[0],
    );
    expect(mockTx.deliveryTransfer.create).not.toHaveBeenCalled();
  });

  it("creates a UTR with both places set and trimmed remarks", async () => {
    mockTx.deliveryTransfer.create.mockResolvedValue({ id: "tr1", transferNo: "UTR-X" });
    await expect(deliveryTransferService.create(creator, input)).resolves.toEqual({ id: "tr1", transferNo: "UTR-X" });
    const data = mockTx.deliveryTransfer.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      releaseBranchId: "b1",
      releaseWarehouseId: null,
      receiveBranchId: null,
      receiveWarehouseId: "w1",
      receiveWarehouseLocationId: "loc1",
      lines: { create: [{ serialNumberId: "s1", modelId: "m1", remarks: "cracked screen" }] },
    });
    expect(data.transferNo).toMatch(/^UTR-/);
  });

  it("needs a location when receive is a warehouse", async () => {
    await expect(
      deliveryTransferService.create(creator, { ...input, receive: { kind: "WAREHOUSE", id: "w1" } }),
    ).rejects.toThrow("Choose the warehouse location that receives the units");
  });

  it("refuses the same place on both sides", async () => {
    await expect(
      deliveryTransferService.create(creator, { ...input, receive: { kind: "BRANCH", id: "b1" } }),
    ).rejects.toThrow("Release and receive must be different places.");
  });

  it("refuses any release other than the delivery branch (R11)", async () => {
    await expect(
      deliveryTransferService.create(creator, { ...input, release: { kind: "BRANCH", id: "b2" } }),
    ).rejects.toThrow("Release is the branch the delivery went to.");
    await expect(
      deliveryTransferService.create(creator, { ...input, release: { kind: "WAREHOUSE", id: "w1" } }),
    ).rejects.toThrow("Release is the branch the delivery went to.");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("maps a transfer number collision to a retry message", async () => {
    mockTx.deliveryTransfer.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "x",
        meta: { target: ["tenant_id", "transfer_no"] },
      }),
    );
    await expect(deliveryTransferService.create(creator, input)).rejects.toThrow(
      "Could not number the transfer. Try again.",
    );
  });

  it("maps the open-line unique index to a plain message", async () => {
    mockTx.deliveryTransfer.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "x",
        meta: { target: ["serial_number_id"] },
      }),
    );
    await expect(deliveryTransferService.create(creator, input)).rejects.toThrow(
      "One or more units are already on an open transfer",
    );
  });
});

describe("deliveryTransferService.decideLine", () => {
  beforeEach(() => {
    mockPrisma.deliveryTransferLine.findFirst.mockResolvedValue({ id: "l1", transferId: "tr1" });
    mockPrisma.deliveryTransfer.findFirst.mockResolvedValue(scopedTransfer("ITR"));
    mockTx.deliveryTransferLine.updateMany.mockResolvedValue({ count: 1 });
  });

  it("locks the header, then cancels the transfer when the last open line is removed", async () => {
    mockTx.deliveryTransferLine.findFirst.mockResolvedValue({
      status: "PENDING",
      serialNumberId: "s1",
      transfer: { status: "PENDING_APPROVAL" },
    });
    mockTx.deliveryTransferLine.findMany.mockResolvedValue([{ status: "REMOVED" }, { status: "REMOVED" }]);

    await deliveryTransferService.decideLine(approver, "l1", "REMOVE");

    expectHeaderLockedFirst(mockTx.deliveryTransferLine.findFirst);
    expect(mockTx.deliveryTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: "tr1", status: "PENDING_APPROVAL" },
      data: { status: "CANCELLED" },
    });
  });
});

describe("deliveryTransferService.updateLineRemarks", () => {
  it("locks the header and re-reads the line before saving", async () => {
    mockPrisma.deliveryTransferLine.findFirst.mockResolvedValue({ id: "l1", transferId: "tr1" });
    mockPrisma.deliveryTransfer.findFirst.mockResolvedValue(scopedTransfer("ITR"));
    mockTx.deliveryTransferLine.findFirst.mockResolvedValue({
      status: "APPROVED",
      transfer: { status: "PENDING_APPROVAL" },
    });
    await expect(deliveryTransferService.updateLineRemarks(approver, "l1", "x")).rejects.toThrow(
      "Remarks can only be changed on a pending line",
    );
    expectHeaderLockedFirst(mockTx.deliveryTransferLine.findFirst);
  });
});

describe("deliveryTransferService.retrySap", () => {
  it("re-queues the job (reviving a dead letter) and runs only this transfer's job", async () => {
    mockPrisma.deliveryTransfer.findFirst
      .mockResolvedValueOnce(scopedTransfer("ITR", "IN_TRANSIT"))
      .mockResolvedValueOnce({ sapDocNo: "701", sapError: null });

    const result = await deliveryTransferService.retrySap(approver, "tr1");

    expect(authorizeDeliveryScope).toHaveBeenCalledWith(approver, expect.objectContaining({ branchId: "b1" }));
    expect(emit).toHaveBeenCalledWith("t1", { id: "tr1", transferNo: "UTR-1" });
    expect(jobsRepo.requeueByReference).toHaveBeenCalledWith("t1", "DeliveryTransfer", "tr1");
    expect(processJobs).toHaveBeenCalledWith("t1", "u1", 1, { referenceType: "DeliveryTransfer", referenceId: "tr1" });
    expect(jobsRepo.requeueByReference.mock.invocationCallOrder[0]).toBeLessThan(
      processJobs.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ sapDocNo: "701", sapError: null });
  });

  it("only retries a released consignment transfer still waiting for SAP", async () => {
    mockPrisma.deliveryTransfer.findFirst.mockResolvedValueOnce(scopedTransfer("ITR", "IN_TRANSIT", 31));
    await expect(deliveryTransferService.retrySap(approver, "tr1")).rejects.toThrow(
      "Only a released transfer waiting for SAP can be retried",
    );
    mockPrisma.deliveryTransfer.findFirst.mockResolvedValueOnce(scopedTransfer("ITR", "CANCELLED"));
    await expect(deliveryTransferService.retrySap(approver, "tr1")).rejects.toThrow(
      "Only a released transfer waiting for SAP can be retried",
    );
    mockPrisma.deliveryTransfer.findFirst.mockResolvedValueOnce(scopedTransfer("SO", "IN_TRANSIT"));
    await expect(deliveryTransferService.retrySap(approver, "tr1")).rejects.toThrow(
      "This transfer does not post to SAP",
    );
    expect(processJobs).not.toHaveBeenCalled();
  });

  it("requires the approve capability", async () => {
    const receiver = { tenantId: "t1", userId: "u9", permissions: ["logistics.delivery_transfer.receive"] };
    await expect(deliveryTransferService.retrySap(receiver, "tr1")).rejects.toThrow(
      "You do not have permission to approve unit transfers",
    );
  });
});

describe("deliveryTransferService.cancelInTransit", () => {
  beforeEach(() => {
    mockPrisma.deliveryTransfer.findFirst.mockResolvedValue(scopedTransfer("ITR", "IN_TRANSIT"));
    mockTx.deliveryTransfer.findFirst.mockResolvedValue({ status: "IN_TRANSIT", sapDocEntry: null });
    mockTx.deliveryTransferLine.findMany.mockResolvedValue([{ status: "APPROVED" }, { status: "REMOVED" }]);
    mockTx.deliveryTransferLine.updateMany.mockResolvedValue({ count: 1 });
    jobsRepo.countInFlight.mockResolvedValue(0);
  });

  it("cancels, removes approved lines and retires the SAP job in the same transaction", async () => {
    await expect(deliveryTransferService.cancelInTransit(approver, "tr1")).resolves.toEqual({ transferId: "tr1" });

    expectHeaderLockedFirst(mockTx.deliveryTransfer.findFirst);
    expect(jobsRepo.deadLetterByReference).toHaveBeenCalledWith(
      "t1",
      "DeliveryTransfer",
      "tr1",
      "Unit transfer cancelled in ISMS",
      mockTx,
    );
    expect(mockTx.deliveryTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: "tr1", tenantId: "t1", status: "IN_TRANSIT", sapDocEntry: null },
      data: { status: "CANCELLED", sapError: null },
    });
    expect(mockTx.deliveryTransferLine.updateMany).toHaveBeenCalledWith({
      where: { transferId: "tr1", status: "APPROVED" },
      data: { status: "REMOVED", decidedById: "u1", decidedAt: expect.any(Date) },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "delivery_transfer.cancelled_in_transit" }) }),
    );
  });

  it("refuses once SAP has the IT or a unit was received", async () => {
    mockTx.deliveryTransfer.findFirst.mockResolvedValueOnce({ status: "IN_TRANSIT", sapDocEntry: 31 });
    await expect(deliveryTransferService.cancelInTransit(approver, "tr1")).rejects.toThrow(
      "SAP already has this transfer. It cannot be cancelled.",
    );
    mockTx.deliveryTransferLine.findMany.mockResolvedValueOnce([{ status: "APPROVED" }, { status: "RECEIVED" }]);
    await expect(deliveryTransferService.cancelInTransit(approver, "tr1")).rejects.toThrow(
      "A unit on this transfer was already received. It cannot be cancelled.",
    );
    mockTx.deliveryTransfer.findFirst.mockResolvedValueOnce({ status: "PENDING_APPROVAL", sapDocEntry: null });
    await expect(deliveryTransferService.cancelInTransit(approver, "tr1")).rejects.toThrow(
      "Only a released transfer in transit can be cancelled",
    );
    expect(mockTx.deliveryTransfer.updateMany).not.toHaveBeenCalled();
  });

  it("refuses while a worker is posting the IT right now", async () => {
    jobsRepo.countInFlight.mockResolvedValueOnce(1);
    await expect(deliveryTransferService.cancelInTransit(approver, "tr1")).rejects.toThrow(
      "SAP is posting this transfer right now. Try again in a minute.",
    );
    expect(mockTx.deliveryTransfer.updateMany).not.toHaveBeenCalled();
  });
});

describe("deliveryTransferService.getDetail sapPending", () => {
  function detailRow(status: string, sapDocEntry: number | null) {
    return {
      id: "tr1",
      transferNo: "UTR-1",
      status,
      createdAt: new Date("2026-10-21T00:00:00Z"),
      sapDocEntry,
      sapDocNo: sapDocEntry ? "700" : null,
      sapDocDate: null,
      sapError: null,
      createdBy: { name: "Op" },
      delivery: { id: "del1", deliveryNo: "DLV-1" },
      releaseBranch: { name: "Branch One" },
      releaseWarehouse: null,
      receiveBranch: null,
      receiveWarehouse: { name: "Main" },
      receiveWarehouseLocation: { code: "A1" },
      lines: [],
    };
  }

  it.each([
    ["ITR", "IN_TRANSIT", null, true],
    ["ITR", "IN_TRANSIT", 31, false],
    ["ITR", "CANCELLED", null, false],
    ["ITR", "PENDING_APPROVAL", null, false],
    ["SO", "IN_TRANSIT", null, false],
  ] as const)("%s %s sapDocEntry=%s → %s", async (docType, status, entry, expected) => {
    mockPrisma.deliveryTransfer.findFirst
      .mockResolvedValueOnce(scopedTransfer(docType, status, entry))
      .mockResolvedValueOnce(detailRow(status, entry));
    const detail = await deliveryTransferService.getDetail(approver, "tr1");
    expect(detail.sapPending).toBe(expected);
  });
});
