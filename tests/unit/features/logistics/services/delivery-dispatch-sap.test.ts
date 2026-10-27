jest.mock("@/lib/database/client", () => {
  const tx = {
    branchDelivery: { updateMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    serialNumber: { findMany: jest.fn(), updateMany: jest.fn() },
    warehouse: { findMany: jest.fn() },
    branchInventory: { findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
    warehouseInventory: { deleteMany: jest.fn() },
    branchDeliveryLine: { createMany: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchDelivery: { findFirst: jest.fn() },
      auditLog: { findFirst: jest.fn() },
      serialNumber: { findMany: jest.fn() },
      branchInventory: { findMany: jest.fn() },
      warehouseInventory: { findMany: jest.fn() },
      warehouse: { findMany: jest.fn() },
      branch: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: { requireCodeId: jest.fn().mockResolvedValue("code1") },
}));
jest.mock("@/features/inventory/services/serial-placement", () => ({
  assertExclusivePlacement: jest.fn(),
  loadCurrentPlacements: jest.fn().mockResolvedValue([]),
  lockSerialNumbers: jest.fn(),
}));
jest.mock("@/features/logistics/services/delivery-scope", () => ({
  authorizeDeliveryScope: jest.fn(),
}));
jest.mock("@/features/sap/adapters/resolve-sap-outbound", () => ({
  resolveSapOutboundPort: jest.fn(),
}));
jest.mock("@/features/sap/services/sap.service", () => ({ sapService: {} }));

import * as dbClient from "@/lib/database/client";
import { deliveryPostingService } from "@/features/logistics/services/delivery-posting.service";
import { authorizeDeliveryScope } from "@/features/logistics/services/delivery-scope";
import { resolveSapOutboundPort } from "@/features/sap/adapters/resolve-sap-outbound";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;
const mockPrisma = dbClient.prisma as unknown as Mocks;
const createDispatchDocument = jest.fn();
const scope = authorizeDeliveryScope as jest.Mock;

function deliveryRow(over: Record<string, unknown> = {}) {
  return {
    id: "del1",
    branchId: "b1",
    sourceWarehouseId: "w1",
    sapDocEntry: null,
    statusCode: { code: "approved" },
    lines: [],
    order: { details: [{ modelId: "m1", quantity: 2, approvedQty: 2 }] },
    ...over,
  };
}

const input = {
  tenantId: "t1",
  userId: "u1",
  permissions: ["logistics.dispatch"],
  deliveryId: "del1",
  serialNumberIds: ["s1", "s2"],
};

beforeEach(() => {
  jest.clearAllMocks();
  (resolveSapOutboundPort as jest.Mock).mockReturnValue({ createDispatchDocument });
  createDispatchDocument.mockResolvedValue({
    docEntry: 77,
    docNum: 9001,
    docDate: "2026-10-21",
    displayNo: "DR-9001",
    lineNums: [0],
  });
  mockPrisma.branchDelivery.findFirst.mockResolvedValue(deliveryRow());
  mockPrisma.branchInventory.findMany.mockResolvedValue([]);
  mockPrisma.warehouseInventory.findMany.mockResolvedValue(
    ["s1", "s2"].map((id) => ({
      serialNumberId: id,
      warehouseLocationId: "loc1",
      warehouseLocation: { warehouseId: "w1" },
      serialNumber: { modelId: "m1" },
    })),
  );
  mockPrisma.branch.findFirst.mockResolvedValue({ primaryWarehouseId: "w1", name: "Branch" });
  mockTx.branchDelivery.update.mockResolvedValue({});
  mockPrisma.auditLog.findFirst.mockResolvedValue(null);
  mockTx.branchDelivery.updateMany.mockResolvedValue({ count: 1 });
  mockTx.branchDelivery.findFirst.mockResolvedValue({ deliveryNo: "DEL-1" });
  mockTx.serialNumber.findMany.mockResolvedValue([
    { id: "s1", serialNo: "SN1" },
    { id: "s2", serialNo: "SN2" },
  ]);
  mockTx.branchInventory.findMany.mockResolvedValue([]);
  mockTx.warehouseInventory.deleteMany.mockResolvedValue({ count: 2 });
  // No warehouse resolves a SAP code unless a test says so: no SAP-placed holds.
  mockPrisma.warehouse.findMany.mockResolvedValue([]);
  mockTx.warehouse.findMany.mockResolvedValue([]);
});

describe("deliveryPostingService.dispatch SAP posting", () => {
  it("posts the SAP document, stores DR number and date, then moves stock", async () => {
    const result = await deliveryPostingService.dispatch(input);

    expect(scope).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", userId: "u1", permissions: input.permissions }),
      expect.objectContaining({ branchId: "b1", sourceWarehouseId: "w1" }),
    );
    expect(createDispatchDocument).toHaveBeenCalledWith({
      tenantId: "t1",
      deliveryId: "del1",
      serialNumberIds: ["s1", "s2"],
    });
    expect(mockTx.branchDelivery.update).toHaveBeenCalledWith({
      where: { id: "del1" },
      data: { sapDocEntry: 77, drNo: "DR-9001", drDate: new Date("2026-10-21") },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "delivery.sap_dispatch_posted",
        entityType: "BranchDelivery",
        entityId: "del1",
        metadata: { sapDocEntry: 77, drNo: "DR-9001", serialNumberIds: ["s1", "s2"] },
      }),
    });
    expect(mockTx.warehouseInventory.deleteMany).toHaveBeenCalled();
    expect(result).toEqual({ movedCount: 2, drNo: "DR-9001" });
  });

  it("stores no DR date when SAP returns no DocDate", async () => {
    createDispatchDocument.mockResolvedValueOnce({
      docEntry: 77,
      docNum: 9001,
      docDate: "",
      displayNo: "DR-9001",
      lineNums: [0],
    });
    await deliveryPostingService.dispatch(input);
    expect(mockTx.branchDelivery.update).toHaveBeenCalledWith({
      where: { id: "del1" },
      data: { sapDocEntry: 77, drNo: "DR-9001", drDate: null },
    });
  });

  it("reuses delivery.sapDocEntry on retry without calling SAP", async () => {
    mockPrisma.branchDelivery.findFirst.mockResolvedValue(
      deliveryRow({ sapDocEntry: 77, drNo: "DR-9001" }),
    );
    const result = await deliveryPostingService.dispatch(input);

    expect(createDispatchDocument).not.toHaveBeenCalled();
    expect(mockTx.branchDelivery.update).not.toHaveBeenCalled();
    expect(mockTx.warehouseInventory.deleteMany).toHaveBeenCalled();
    expect(result.drNo).toBe("DR-9001");
  });

  it("retry with different serials is refused with the posted serials", async () => {
    mockPrisma.branchDelivery.findFirst.mockResolvedValue(
      deliveryRow({ sapDocEntry: 77, drNo: "DR-9001" }),
    );
    mockPrisma.auditLog.findFirst.mockResolvedValue({
      metadata: { sapDocEntry: 77, drNo: "DR-9001", serialNumberIds: ["s1", "s9"] },
    });
    mockPrisma.serialNumber.findMany.mockResolvedValue([{ serialNo: "SN1" }, { serialNo: "SN9" }]);
    await expect(deliveryPostingService.dispatch(input)).rejects.toThrow(
      "SAP already has DR# DR-9001 for this delivery with different serials. Dispatch the same serials: SN1, SN9.",
    );
    expect(mockTx.warehouseInventory.deleteMany).not.toHaveBeenCalled();
  });

  it("retry with the same serials in another order proceeds", async () => {
    mockPrisma.branchDelivery.findFirst.mockResolvedValue(
      deliveryRow({ sapDocEntry: 77, drNo: "DR-9001" }),
    );
    mockPrisma.auditLog.findFirst.mockResolvedValue({
      metadata: { serialNumberIds: ["s1", "s2"] },
    });
    await deliveryPostingService.dispatch({ ...input, serialNumberIds: ["s2", "s1"] });
    expect(createDispatchDocument).not.toHaveBeenCalled();
    expect(mockTx.warehouseInventory.deleteMany).toHaveBeenCalled();
  });

  it("leaves stock untouched when SAP rejects", async () => {
    createDispatchDocument.mockRejectedValue(new Error("SAP says no"));
    await expect(deliveryPostingService.dispatch(input)).rejects.toThrow("SAP says no");

    expect(mockTx.branchDelivery.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.warehouseInventory.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses before SAP when the scope check fails", async () => {
    scope.mockRejectedValueOnce(new Error("This delivery is outside your area of responsibility"));
    await expect(deliveryPostingService.dispatch(input)).rejects.toThrow("outside your area");
    expect(createDispatchDocument).not.toHaveBeenCalled();
  });

  it("surfaces the legacy-order refusal and moves no stock", async () => {
    createDispatchDocument.mockRejectedValue(
      new Error("This order was approved before SAP posting was enabled. Re-approve or post it in SAP."),
    );
    await expect(deliveryPostingService.dispatch(input)).rejects.toThrow(
      "approved before SAP posting was enabled",
    );
    expect(mockTx.warehouseInventory.deleteMany).not.toHaveBeenCalled();
  });
});

describe("deliveryPostingService.dispatch from SAP placement", () => {
  const sapRows = [
    { id: "s1", serialNo: "SN1", modelId: "m1", sapWhsCode: "W1", branchInventories: [{ branch: { name: "Owner" } }] },
    { id: "s2", serialNo: "SN2", modelId: "m1", sapWhsCode: "W1", branchInventories: [] },
  ];

  beforeEach(() => {
    mockPrisma.warehouseInventory.findMany.mockResolvedValue([]);
    mockPrisma.warehouse.findMany.mockResolvedValue([{ id: "w1", code: "W1" }]);
    mockPrisma.serialNumber.findMany.mockResolvedValue(sapRows);
    mockTx.warehouse.findMany.mockResolvedValue([{ id: "w1", code: "W1" }]);
    mockTx.serialNumber.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      "sapWhsCode" in where ? sapRows : sapRows.map(({ id, serialNo }) => ({ id, serialNo })),
    );
    // s1 carries the serial sync's own STK row; s2 has no ISMS stock row at all.
    mockTx.branchInventory.findMany.mockImplementation(async ({ select }: { select: Record<string, unknown> }) =>
      "branch" in select ? [] : [{ serialNumberId: "s1" }],
    );
    mockTx.branchInventory.updateMany.mockResolvedValue({ count: 1 });
  });

  it("moves the sync's STK row, adds a DIT row for the rest, and clears the SAP warehouse link", async () => {
    await deliveryPostingService.dispatch(input);

    expect(mockTx.warehouseInventory.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.branchInventory.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", serialNumberId: { in: ["s1"] }, statusCodeId: "code1", warehouseLocationId: null },
      data: { branchId: "b1", statusCodeId: "code1", updatedById: "u1" },
    });
    expect(mockTx.branchInventory.createMany).toHaveBeenCalledWith({
      data: [{ tenantId: "t1", branchId: "b1", serialNumberId: "s2", statusCodeId: "code1", updatedById: "u1" }],
    });
    expect(mockTx.serialNumber.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", id: { in: ["s1", "s2"] } },
      data: { sapWhsCode: null, sapOnHand: false },
    });
    expect(mockTx.branchDeliveryLine.createMany).toHaveBeenCalledWith({
      data: [
        { deliveryId: "del1", serialNumberId: "s1", warehouseLocationFromId: null },
        { deliveryId: "del1", serialNumberId: "s2", warehouseLocationFromId: null },
      ],
    });
  });

  it("refuses when SAP moved a serial out of the warehouse after it was picked", async () => {
    mockTx.serialNumber.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      "sapWhsCode" in where ? sapRows.slice(0, 1) : sapRows.map(({ id, serialNo }) => ({ id, serialNo })),
    );

    await expect(deliveryPostingService.dispatch(input)).rejects.toThrow(/moved in SAP or taken in ISMS/);
    expect(mockTx.branchInventory.createMany).not.toHaveBeenCalled();
  });
});
