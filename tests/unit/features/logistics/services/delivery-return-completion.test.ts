jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    deliveryReturnRequest: { findFirst: jest.fn(), updateMany: jest.fn() },
    deliveryTransferLine: { findMany: jest.fn() },
    branchDelivery: { findFirst: jest.fn(), updateMany: jest.fn() },
    branchInventory: { deleteMany: jest.fn() },
    warehouseInventory: { createMany: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    reasonStatusCode: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) },
  };
});
jest.mock("@/features/inventory/services/serial-placement", () => ({
  assertExclusivePlacement: jest.fn(),
  loadCurrentPlacements: jest.fn(),
  lockSerialNumbers: jest.fn(),
}));

import * as dbClient from "@/lib/database/client";
import {
  assertExclusivePlacement,
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import { completeDeliveryReturn } from "@/features/logistics/services/delivery-return-completion";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;

const input = { tenantId: "t1", userId: "u2", returnId: "r1", kind: "IT" as const, sapDocNo: "700" };

function approvedRequest(status = "APPROVED") {
  return {
    status,
    requestNo: "RTN-1",
    deliveryId: "del1",
    delivery: { branchId: "b1" },
    lines: [
      { serialNumberId: "s2", warehouseLocationToId: "loc1" },
      { serialNumberId: "s3", warehouseLocationToId: "loc2" },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.deliveryReturnRequest.findFirst.mockResolvedValue(approvedRequest());
  (loadCurrentPlacements as jest.Mock).mockResolvedValue([
    { table: "branch", id: "bi2", serialNumberId: "s2", branchId: "b1", statusCode: "DIT" },
    { table: "branch", id: "bi3", serialNumberId: "s3", branchId: "b1", statusCode: "DIT" },
  ]);
  mockTx.branchInventory.deleteMany.mockResolvedValue({ count: 2 });
  mockTx.deliveryReturnRequest.updateMany.mockResolvedValue({ count: 1 });
  mockTx.branchDelivery.findFirst.mockResolvedValue({
    acceptedAt: null,
    statusCodeId: "id-pending",
    statusCode: { code: "pending" },
  });
  mockTx.branchDelivery.updateMany.mockResolvedValue({ count: 1 });
  mockTx.deliveryTransferLine.findMany.mockResolvedValue([]);
  mockTx.reasonStatusCode.findFirst.mockImplementation(async ({ where }: { where: { code: string } }) => ({
    id: `id-${where.code}`,
  }));
});

describe("completeDeliveryReturn", () => {
  it("moves the DIT units back to their warehouse locations and completes the request", async () => {
    await completeDeliveryReturn(input);

    expect(lockSerialNumbers).toHaveBeenCalledWith(mockTx, ["s2", "s3"]);
    expect(assertExclusivePlacement).toHaveBeenCalledWith(
      expect.objectContaining({ replacingIds: ["bi2", "bi3"] }),
    );
    expect(mockTx.branchInventory.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", branchId: "b1", serialNumberId: { in: ["s2", "s3"] }, statusCode: { code: "DIT" } },
    });
    expect(mockTx.warehouseInventory.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ serialNumberId: "s2", warehouseLocationId: "loc1", systemStatus: "Returned from delivery" }),
      expect.objectContaining({ serialNumberId: "s3", warehouseLocationId: "loc2", systemStatus: "Returned from delivery" }),
    ]);
    expect(mockTx.serialNumberHistory.createMany.mock.calls[0][0].data[0]).toMatchObject({
      txnType: "return",
      details: "Returned to warehouse on RTN-1 (SAP IT 700)",
      status: "Warehouse",
      createdById: "u2",
    });
    expect(mockTx.deliveryReturnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", tenantId: "t1", status: "APPROVED" },
      data: { status: "COMPLETED" },
    });
    expect(mockTx.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "delivery_return.completed" });
  });

  it("rejects a pending delivery: no unit reached stock (R8b)", async () => {
    const result = await completeDeliveryReturn(input);
    expect(result).toEqual({ deliveryStatus: "rejected" });
    expect(mockTx.branchDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: "del1", tenantId: "t1", statusCodeId: "id-pending" },
      data: { statusCodeId: "id-rejected" },
    });
    // The settle locks the delivery row after the serials.
    const lock = (mockTx.$queryRaw as unknown as jest.Mock).mock.calls[0];
    expect((lock[0] as TemplateStringsArray).join("?")).toMatch(/FROM branch_deliveries [\s\S]*FOR UPDATE/);
  });

  it("accepts a partial delivery and stamps acceptedAt (R8b)", async () => {
    mockTx.branchDelivery.findFirst.mockResolvedValue({
      acceptedAt: null,
      statusCodeId: "id-partial",
      statusCode: { code: "partial" },
    });
    const result = await completeDeliveryReturn(input);
    expect(result).toEqual({ deliveryStatus: "accepted" });
    expect(mockTx.branchDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: "del1", tenantId: "t1", statusCodeId: "id-partial" },
      data: { statusCodeId: "id-accepted", acceptedAt: expect.any(Date) },
    });
  });

  it("keeps an existing acceptedAt on a partial delivery (R8b)", async () => {
    mockTx.branchDelivery.findFirst.mockResolvedValue({
      acceptedAt: new Date("2026-10-01"),
      statusCodeId: "id-partial",
      statusCode: { code: "partial" },
    });
    await completeDeliveryReturn(input);
    expect(mockTx.branchDelivery.updateMany.mock.calls[0][0].data).toEqual({ statusCodeId: "id-accepted" });
  });

  it("refuses when a return serial is on an open unit transfer, before moving stock", async () => {
    mockTx.deliveryTransferLine.findMany.mockResolvedValue([
      { serialNumberId: "s3", serialNumber: { serialNo: "SN3" }, transfer: { id: "tr1", transferNo: "UTR-9" } },
    ]);
    await expect(completeDeliveryReturn(input)).rejects.toThrow("Unit SN3 is on transfer UTR-9");
    expect(mockTx.deliveryTransferLine.findMany.mock.calls[0][0].where).toMatchObject({
      serialNumberId: { in: ["s2", "s3"] },
      status: { in: ["PENDING", "APPROVED"] },
    });
    expect(mockTx.branchInventory.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.deliveryReturnRequest.updateMany).not.toHaveBeenCalled();
  });

  it("is a no-op for a completed request", async () => {
    mockTx.deliveryReturnRequest.findFirst.mockResolvedValue(approvedRequest("COMPLETED"));
    expect(await completeDeliveryReturn(input)).toBeNull();
    expect(mockTx.branchInventory.deleteMany).not.toHaveBeenCalled();
  });

  it("rolls back when a unit is no longer in transit", async () => {
    mockTx.branchInventory.deleteMany.mockResolvedValue({ count: 1 });
    await expect(completeDeliveryReturn(input)).rejects.toThrow("Some units are no longer in transit at the branch");
    expect(mockTx.warehouseInventory.createMany).not.toHaveBeenCalled();
  });
});
