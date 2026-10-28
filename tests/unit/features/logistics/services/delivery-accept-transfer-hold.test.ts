jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    branchDelivery: { updateMany: jest.fn(), findFirst: jest.fn() },
    branchInventory: { updateMany: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
    deliveryTransferLine: { findMany: jest.fn() },
    deliveryReturnLine: { findMany: jest.fn() },
    deliveryReturnRequest: { count: jest.fn() },
    reasonStatusCode: { findFirst: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchDelivery: { findFirst: jest.fn() },
      branchInventory: { findMany: jest.fn() },
      deliveryTransferLine: { findMany: jest.fn() },
      deliveryReturnRequest: { count: jest.fn() },
      deliveryReturnLine: { findMany: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: { requireCodeId: jest.fn(async (_t: string, _c: string, code: string) => `id-${code}`) },
}));
jest.mock("@/features/inventory/services/serial-placement", () => ({
  assertExclusivePlacement: jest.fn(),
  loadCurrentPlacements: jest.fn().mockResolvedValue([]),
  lockSerialNumbers: jest.fn(),
}));
jest.mock("@/features/logistics/services/delivery-scope", () => ({
  authorizeDeliveryScope: jest.fn(),
}));
jest.mock("@/features/sap/adapters/resolve-sap-outbound", () => ({ resolveSapOutboundPort: jest.fn() }));
jest.mock("@/features/sap/services/sap.service", () => ({ sapService: {} }));

import * as dbClient from "@/lib/database/client";
import { deliveryPostingService } from "@/features/logistics/services/delivery-posting.service";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;
const mockPrisma = dbClient.prisma as unknown as Mocks;
const queryRaw = () => mockTx.$queryRaw as unknown as jest.Mock;

const input = { tenantId: "t1", userId: "u1", permissions: [], deliveryId: "del1" };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.branchDelivery.findFirst.mockResolvedValue({
    id: "del1",
    branchId: "b1",
    sourceWarehouseId: "w1",
    sapDocEntry: 1,
    drNo: "DR-1",
    statusCode: { code: "partial" },
    lines: [
      { serialNumberId: "s1", warehouseLocationFromId: "loc1" },
      { serialNumberId: "s2", warehouseLocationFromId: "loc1" },
      { serialNumberId: "s3", warehouseLocationFromId: "loc1" },
    ],
    order: { details: [] },
  });
  // s1 left on a received transfer (no branch row), s2 and s3 still DIT.
  mockPrisma.branchInventory.findMany.mockResolvedValue([
    { serialNumberId: "s2", statusCode: { code: "DIT" } },
    { serialNumberId: "s3", statusCode: { code: "DIT" } },
  ]);
  mockPrisma.deliveryTransferLine.findMany.mockResolvedValue([]);
  mockPrisma.deliveryReturnLine.findMany.mockResolvedValue([]);
  mockTx.deliveryTransferLine.findMany.mockResolvedValue([]);
  mockTx.branchInventory.updateMany.mockResolvedValue({ count: 1 });
  mockTx.branchDelivery.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.deliveryReturnRequest.count.mockResolvedValue(0);
  mockTx.deliveryReturnLine.findMany.mockResolvedValue([]);
});

describe("deliveryPostingService.accept with unit transfers (R7)", () => {
  it("refuses a unit on an open transfer and moves nothing", async () => {
    mockPrisma.deliveryTransferLine.findMany.mockResolvedValue([
      { serialNumberId: "s2", serialNumber: { serialNo: "SN-2" }, transfer: { id: "tr1", transferNo: "UTR-ABC" } },
    ]);

    await expect(deliveryPostingService.accept({ ...input, serialNumberIds: ["s2"] })).rejects.toThrow(
      "Unit SN-2 is on transfer UTR-ABC",
    );
    expect(mockPrisma.deliveryTransferLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          serialNumberId: { in: ["s2"] },
          status: { in: ["PENDING", "APPROVED"] },
        }),
      }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("checks every in-transit unit when accepting the whole delivery", async () => {
    mockPrisma.deliveryTransferLine.findMany.mockResolvedValue([
      { serialNumberId: "s3", serialNumber: { serialNo: "SN-3" }, transfer: { id: "tr1", transferNo: "UTR-ABC" } },
    ]);
    await expect(deliveryPostingService.accept(input)).rejects.toThrow("Unit SN-3 is on transfer UTR-ABC");
    expect(mockPrisma.deliveryTransferLine.findMany.mock.calls[0][0].where.serialNumberId).toEqual({
      in: ["s2", "s3"],
    });
  });

  it("marks the delivery accepted when the last in-transit unit is accepted after a transfer", async () => {
    // Inside the transaction, after the claim: nothing is DIT any more.
    mockTx.branchDelivery.findFirst
      .mockResolvedValueOnce({
        branchId: "b1",
        acceptedAt: null,
        statusCodeId: "id-partial",
        statusCode: { code: "partial" },
        lines: [{ serialNumberId: "s1" }, { serialNumberId: "s2" }, { serialNumberId: "s3" }],
      })
      .mockResolvedValue({ deliveryNo: "DEL-1", branch: { name: "Branch" } });
    mockTx.branchInventory.count.mockResolvedValue(0);
    mockTx.branchInventory.updateMany.mockResolvedValue({ count: 2 });
    mockTx.reasonStatusCode.findFirst.mockResolvedValue({ id: "id-accepted" });

    const result = await deliveryPostingService.accept({ ...input, serialNumberIds: ["s2", "s3"] });

    expect(result.status).toBe("accepted");
    // finalizeDeliveryIfSettled locks the delivery row before counting DIT lines.
    const lock = queryRaw().mock.calls[0];
    expect((lock[0] as TemplateStringsArray).join("?")).toMatch(/FROM branch_deliveries [\s\S]*FOR UPDATE/);
    expect(lock.slice(1)).toEqual(["del1", "t1"]);
    expect(queryRaw().mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.branchInventory.count.mock.invocationCallOrder[0],
    );
    expect(mockTx.branchDelivery.updateMany).toHaveBeenLastCalledWith({
      where: { id: "del1", tenantId: "t1", statusCodeId: "id-partial" },
      data: { statusCodeId: "id-accepted", acceptedAt: expect.any(Date) },
    });
  });
});

const heldOnReject = [
  { serialNumberId: "s2", serialNumber: { serialNo: "SN-2" }, returnRequest: { id: "r0", requestNo: "RTN-0" } },
];

describe("deliveryPostingService.accept with an open reject request", () => {
  it("refuses a unit on a pending reject request before the transaction", async () => {
    mockPrisma.deliveryReturnLine.findMany.mockResolvedValue(heldOnReject);
    await expect(deliveryPostingService.accept({ ...input, serialNumberIds: ["s2"] })).rejects.toThrow(
      "Unit SN-2 is waiting on reject request RTN-0",
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("accepts the delivery's other units while a reject request holds one", async () => {
    mockPrisma.deliveryReturnLine.findMany.mockImplementation(async ({ where }: { where: { serialNumberId: { in: string[] } } }) =>
      heldOnReject.filter((row) => where.serialNumberId.in.includes(row.serialNumberId)),
    );
    mockTx.branchDelivery.findFirst
      .mockResolvedValueOnce({
        branchId: "b1",
        acceptedAt: null,
        statusCodeId: "id-partial",
        statusCode: { code: "partial" },
        lines: [{ serialNumberId: "s1" }, { serialNumberId: "s2" }, { serialNumberId: "s3" }],
      })
      .mockResolvedValue({ deliveryNo: "DEL-1", branch: { name: "Branch" } });
    mockTx.branchInventory.count.mockResolvedValue(1);
    await deliveryPostingService.accept({ ...input, serialNumberIds: ["s3"] });
    expect(mockTx.branchInventory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ serialNumberId: { in: ["s3"] } }) }),
    );
  });

  it("re-checks under the serial locks and moves nothing", async () => {
    mockTx.deliveryReturnLine.findMany.mockResolvedValue(heldOnReject);
    await expect(deliveryPostingService.accept({ ...input, serialNumberIds: ["s2"] })).rejects.toThrow(
      "Unit SN-2 is waiting on reject request RTN-0",
    );
    expect(mockTx.branchInventory.updateMany).not.toHaveBeenCalled();
  });
});

describe("deliveryPostingService.listReceiptLines states", () => {
  it("lists a unit received on this delivery's unit transfer as TRANSFERRED, not received", async () => {
    // loadDelivery reads the delivery first, then the header with serial details.
    mockPrisma.branchDelivery.findFirst.mockReset();
    mockPrisma.branchDelivery.findFirst
      .mockResolvedValueOnce({
        id: "del1",
        branchId: "b1",
        sourceWarehouseId: "w1",
        sapDocEntry: 1,
        drNo: "DR-1",
        statusCode: { code: "partial" },
        lines: ["s1", "s2", "s3"].map((id) => ({ serialNumberId: id, warehouseLocationFromId: "loc1" })),
        order: { sapDocType: "ITR", details: [] },
      })
      .mockResolvedValueOnce({
        deliveryNo: "DLV-1",
        lines: ["s1", "s2", "s3"].map((id) => ({
          serialNumberId: id,
          serialNumber: { serialNo: `SN-${id}`, model: { skuCode: "SKU", name: "Model" } },
        })),
      });
    mockPrisma.deliveryTransferLine.findMany.mockImplementation(async (args: { where: { status: unknown } }) =>
      args.where.status === "RECEIVED"
        ? [{ serialNumberId: "s1" }]
        : [{ serialNumberId: "s3", serialNumber: { serialNo: "SN-s3" }, transfer: { id: "tr2", transferNo: "UTR-2" } }],
    );

    const result = await deliveryPostingService.listReceiptLines(input, "del1");

    expect(result.lines.map((line) => [line.serialNumberId, line.state])).toEqual([
      ["s1", "TRANSFERRED"],
      ["s2", "IN_TRANSIT"],
      ["s3", "ON_TRANSFER"],
    ]);
    const receivedQuery = mockPrisma.deliveryTransferLine.findMany.mock.calls.find(
      ([args]) => args.where.status === "RECEIVED",
    );
    expect(receivedQuery?.[0].where).toEqual({
      serialNumberId: { in: ["s1", "s2", "s3"] },
      status: "RECEIVED",
      transfer: { tenantId: "t1", deliveryId: "del1" },
    });
  });
});
