jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    branchDelivery: { findFirst: jest.fn(), update: jest.fn() },
    serialNumber: { findMany: jest.fn(), updateMany: jest.fn(), createMany: jest.fn() },
    productModel: { findMany: jest.fn() },
    branchInventory: { updateMany: jest.fn(), createMany: jest.fn() },
    warehouseInventory: { deleteMany: jest.fn() },
    branchDeliveryLine: { createMany: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    reasonStatusCode: { findFirst: jest.fn() },
    deliverySapDocument: { upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchDelivery: { findMany: jest.fn(), findFirst: jest.fn() },
      deliverySapDocument: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/features/sap/services/sap-service-layer-client", () => ({
  sapServiceLayerClient: { request: jest.fn() },
}));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn() },
}));
jest.mock("@/features/sap/repositories/sap-sync-cursor.repository", () => ({
  sapSyncCursorRepository: { get: jest.fn(), advance: jest.fn(), recordError: jest.fn() },
}));
jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: {
    requireCodeId: jest.fn(async (_t: string, _c: string, code: string) => `inv-${code}`),
  },
}));
jest.mock("@/features/inventory/services/serial-placement", () => ({
  loadCurrentPlacements: jest.fn(),
  lockSerialNumbers: jest.fn(),
  lockSerialRegistrations: jest.fn(),
}));

import * as dbClient from "@/lib/database/client";
import { loadCurrentPlacements } from "@/features/inventory/services/serial-placement";
import { runSapCopyToFollow } from "@/features/logistics/services/sap-copy-to-follow.service";
import { sapSyncCursorRepository } from "@/features/sap/repositories/sap-sync-cursor.repository";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;
const mockPrisma = dbClient.prisma as unknown as Mocks;
const request = sapServiceLayerClient.request as jest.Mock;
const cursor = sapSyncCursorRepository as unknown as Record<string, jest.Mock>;
const placements = loadCurrentPlacements as jest.Mock;

const COPIED_IT = {
  DocEntry: 491349,
  DocNum: 494398,
  DocDate: "2026-10-27T00:00:00Z",
  U_ISMS_PO_No: "ITR#2026-10-89938",
  ToWarehouse: "ABL003",
  StockTransferLines: [
    {
      ItemCode: "55QUHW01",
      BaseType: "InventoryTransferRequest",
      BaseEntry: 368865,
      SerialNumbers: [{ InternalSerialNumber: "SN1" }],
    },
  ],
};

const ok = (data: unknown) => ({ statusCode: 200, data, rawBody: JSON.stringify(data) });

/** SAP: one IT page with our IT and a foreign one, then empty; DRs always empty. */
function sapWith(itDoc: Record<string, unknown> = COPIED_IT) {
  let itPages = 0;
  request.mockImplementation(async ({ path }: { path: string }) => {
    if (path.startsWith("/StockTransfers(")) return ok(itDoc);
    if (path.startsWith("/StockTransfers?")) {
      itPages += 1;
      return ok({
        value:
          itPages === 1
            ? [
                { DocEntry: 491348, U_ISMS_PO_No: "UTR-MVKJ5R3V" },
                { DocEntry: 491349, U_ISMS_PO_No: "ITR#2026-10-89938" },
              ]
            : [],
      });
    }
    return ok({ value: [] });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (sapServiceLayerService.getCredentials as jest.Mock).mockResolvedValue({ id: "c1" });
  cursor.get.mockResolvedValue({ lastKey: "491300" });
  mockPrisma.deliverySapDocument.findMany.mockResolvedValue([]);
  mockPrisma.deliverySapDocument.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.branchDelivery.findMany.mockResolvedValue([
    {
      id: "del1",
      order: { orderNumber: "ITR#2026-10-89938", sapDocType: "ITR", sapDocEntry: 368865 },
    },
  ]);
  mockTx.branchDelivery.findFirst.mockResolvedValue({
    branchId: "b1",
    deliveryNo: "DEL-1",
    sapDocEntry: null,
    statusCode: { code: "approved" },
    lines: [],
  });
  mockTx.serialNumber.findMany.mockResolvedValue([{ id: "s1", serialNo: "SN1", deletedAt: null }]);
  mockTx.reasonStatusCode.findFirst.mockResolvedValue({ id: "wf-pending" });
  // The serial sync already made it Stock at the source branch.
  placements.mockResolvedValue([
    {
      table: "branch",
      id: "bi1",
      serialNumberId: "s1",
      serialNo: "SN1",
      tenantId: "t1",
      place: "branch Source",
      branchId: "b-source",
      warehouseId: null,
      warehouseLocationId: null,
      serviceCenterId: null,
      serviceCenterLocationId: null,
      statusCode: "STK",
    },
  ]);
  mockTx.branchInventory.updateMany.mockResolvedValue({ count: 1 });
});

it("applies only the IT that belongs to an open ISMS delivery and moves the cursor past the page", async () => {
  sapWith();

  const result = await runSapCopyToFollow("t1");

  expect(result).toMatchObject({ applied: 1, failed: 0, flagged: 0, scanned: 2 });
  const listPath = decodeURIComponent(
    request.mock.calls.find(([arg]) => arg.path.startsWith("/StockTransfers?"))[0].path,
  );
  expect(listPath).toContain("U_ISMS_PO_No ne null and DocEntry gt 491300");
  // Only our document is read in full.
  const reads = request.mock.calls.filter(([arg]) => arg.path.startsWith("/StockTransfers("));
  expect(reads).toHaveLength(1);

  expect(mockTx.branchInventory.updateMany).toHaveBeenCalledWith({
    where: { id: { in: ["bi1"] }, statusCodeId: "inv-STK" },
    data: { branchId: "b1", statusCodeId: "inv-DIT", warehouseLocationId: null },
  });
  expect(mockTx.branchDeliveryLine.createMany).toHaveBeenCalledWith({
    data: [{ deliveryId: "del1", serialNumberId: "s1", warehouseLocationFromId: null }],
    skipDuplicates: true,
  });
  expect(mockTx.branchDelivery.update).toHaveBeenCalledWith({
    where: { id: "del1" },
    data: {
      statusCodeId: "wf-pending",
      sapDocEntry: 491349,
      drNo: "494398",
      drDate: new Date("2026-10-27"),
    },
  });
  expect(mockTx.serialNumber.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ sapWhsCode: "ABL003" }) }),
  );
  expect(mockTx.deliverySapDocument.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({ docKind: "IT", docEntry: 491349, status: "APPLIED", serialCount: 1 }),
    }),
  );
  expect(cursor.advance).toHaveBeenCalledWith("t1", "copy-to-follow:it", "491349", 0);
});

it("does not read or apply a document it already recorded", async () => {
  sapWith();
  mockPrisma.deliverySapDocument.findMany.mockImplementation(async ({ where }: { where: { status?: string } }) =>
    where.status ? [] : [{ docEntry: 491349 }],
  );

  const result = await runSapCopyToFollow("t1");

  expect(result.applied).toBe(0);
  expect(request.mock.calls.some(([arg]) => arg.path.startsWith("/StockTransfers("))).toBe(false);
  expect(cursor.advance).toHaveBeenCalledWith("t1", "copy-to-follow:it", "491349", 0);
});

it("flags an IT copied from a different ITR without touching stock", async () => {
  sapWith({
    ...COPIED_IT,
    StockTransferLines: [{ ...COPIED_IT.StockTransferLines[0], BaseEntry: 1 }],
  });

  const result = await runSapCopyToFollow("t1");

  expect(result).toMatchObject({ applied: 0, flagged: 1 });
  expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  expect(mockPrisma.deliverySapDocument.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ docEntry: 491349, status: "FLAGGED", deliveryId: "del1" }),
  });
});

it("records a sold serial as FAILED so the document is retried, not applied", async () => {
  sapWith();
  placements.mockResolvedValue([
    {
      table: "branch",
      id: "bi1",
      serialNumberId: "s1",
      serialNo: "SN1",
      tenantId: "t1",
      place: "branch Source (SLD)",
      branchId: "b-source",
      warehouseId: null,
      warehouseLocationId: null,
      serviceCenterId: null,
      serviceCenterLocationId: null,
      statusCode: "SLD",
    },
  ]);

  const result = await runSapCopyToFollow("t1");

  expect(result).toMatchObject({ applied: 0, failed: 1 });
  expect(mockTx.branchDeliveryLine.createMany).not.toHaveBeenCalled();
  expect(mockPrisma.deliverySapDocument.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ status: "FAILED", error: "SN1 is at branch Source (SLD) in ISMS" }),
  });
});

it("starts from a date on the first run and does nothing when no delivery waits on SAP", async () => {
  sapWith();
  cursor.get.mockResolvedValue({ lastKey: null });
  mockPrisma.branchDelivery.findFirst.mockResolvedValue(null);

  const result = await runSapCopyToFollow("t1");

  expect(result.scanned).toBe(0);
  expect(request).not.toHaveBeenCalled();
});

it("records the delivery's own ISMS-posted IT without moving stock or changing the delivery", async () => {
  sapWith();
  mockTx.branchDelivery.findFirst.mockResolvedValue({
    branchId: "b1",
    deliveryNo: "DEL-1",
    sapDocEntry: 491349,
    statusCode: { code: "accepted" },
    lines: [{ serialNumberId: "s1" }],
  });

  const result = await runSapCopyToFollow("t1");

  expect(result.applied).toBe(1);
  expect(mockTx.branchInventory.updateMany).not.toHaveBeenCalled();
  expect(mockTx.branchDelivery.update).not.toHaveBeenCalled();
  expect(mockTx.auditLog.create).not.toHaveBeenCalled();
  expect(mockTx.deliverySapDocument.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ create: expect.objectContaining({ status: "APPLIED", serialCount: 0 }) }),
  );
});
