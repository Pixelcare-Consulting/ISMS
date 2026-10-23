const tx = {
  serialNumber: { findMany: jest.fn() },
  branchInventory: { findMany: jest.fn(), updateMany: jest.fn() },
  serialNumberHistory: { createMany: jest.fn() },
  auditLog: { create: jest.fn() },
  $queryRaw: jest.fn(),
};

jest.mock("@/lib/database/client", () => ({
  prisma: {
    warehouseLocation: { findFirst: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  },
}));
jest.mock("@/features/inventory/services/serial-placement", () => ({
  lockSerialNumbers: jest.fn(),
}));

import { tagSerialsToLocation } from "@/features/inventory/services/branch-stock-location.service";
import { prisma } from "@/lib/database/client";

const mockedLocation = prisma.warehouseLocation.findFirst as jest.Mock;

function shelfRow(
  serialNo: string,
  over: Partial<{
    primaryWarehouseId: string;
    status: string;
    modelId: string;
    warehouseLocationId: string | null;
    locationCode: string;
  }> = {},
) {
  return {
    id: `bi-${serialNo}`,
    serialNumberId: `sn-${serialNo}`,
    warehouseLocationId: over.warehouseLocationId ?? null,
    branch: { primaryWarehouseId: over.primaryWarehouseId ?? "wh-1", deletedAt: null },
    statusCode: { code: over.status ?? "STK" },
    serialNumber: { serialNo, modelId: over.modelId ?? "model-1", deletedAt: null },
    warehouseLocation: over.locationCode ? { code: over.locationCode } : null,
  };
}

const input = {
  tenantId: "t1",
  userId: "u1",
  warehouseId: "wh-1",
  locationId: "loc-a3",
  modelId: "model-1",
};

describe("tagSerialsToLocation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLocation.mockResolvedValue({ code: "A3", warehouse: { code: "FWH14P1F" } });
    tx.serialNumber.findMany.mockResolvedValue([]);
  });

  it("tags untagged shelf stock and skips serials already in this location", async () => {
    tx.branchInventory.findMany.mockResolvedValue([
      shelfRow("SN1"),
      shelfRow("SN2", { warehouseLocationId: "loc-a3", locationCode: "A3" }),
    ]);
    tx.branchInventory.updateMany.mockResolvedValue({ count: 1 });

    const result = await tagSerialsToLocation({ ...input, serialNos: ["SN1", "SN2"] });

    expect(result).toEqual({ tagged: 1, skipped: 1, message: "Stocked 1 serial into A3. 1 already there." });
    expect(tx.branchInventory.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["bi-SN1"] }, warehouseLocationId: null },
      data: { warehouseLocationId: "loc-a3", updatedById: "u1" },
    });
  });

  it("refuses serials not in a branch that uses this warehouse", async () => {
    tx.branchInventory.findMany.mockResolvedValue([shelfRow("SN1", { primaryWarehouseId: "wh-2" })]);
    await expect(tagSerialsToLocation({ ...input, serialNos: ["SN1", "SN9"] })).rejects.toThrow(
      "Not in the stock of a branch that uses FWH14P1F: SN1, SN9.",
    );
    expect(tx.branchInventory.updateMany).not.toHaveBeenCalled();
  });

  it("refuses sold or in-transit units", async () => {
    tx.branchInventory.findMany.mockResolvedValue([shelfRow("SN1", { status: "SLD" })]);
    await expect(tagSerialsToLocation({ ...input, serialNos: ["SN1"] })).rejects.toThrow(
      "Not on the shelf (sold or in transit): SN1.",
    );
  });

  it("refuses a serial of another model", async () => {
    tx.branchInventory.findMany.mockResolvedValue([shelfRow("SN1", { modelId: "model-2" })]);
    await expect(tagSerialsToLocation({ ...input, serialNos: ["SN1"] })).rejects.toThrow(
      "Not this model: SN1.",
    );
  });

  it("points to Edit location when a serial is already in another location", async () => {
    tx.branchInventory.findMany.mockResolvedValue([
      shelfRow("SN1", { warehouseLocationId: "loc-a1", locationCode: "A1" }),
    ]);
    await expect(tagSerialsToLocation({ ...input, serialNos: ["SN1"] })).rejects.toThrow(
      "Already in another location: SN1 (A1). Use Edit location in Warehouse stock to move them.",
    );
  });

  it("refuses a location outside the warehouse", async () => {
    mockedLocation.mockResolvedValue(null);
    await expect(tagSerialsToLocation({ ...input, serialNos: ["SN1"] })).rejects.toThrow(
      "That location is not in this warehouse.",
    );
  });
});
