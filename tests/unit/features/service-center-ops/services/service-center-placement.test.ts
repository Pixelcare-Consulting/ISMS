const lockSerialNumbers = jest.fn();
const loadCurrentPlacements = jest.fn();

jest.mock("@/features/inventory/services/serial-placement", () => ({
  ...jest.requireActual("@/features/inventory/services/serial-placement"),
  lockSerialNumbers: (...args: unknown[]) => lockSerialNumbers(...args),
  loadCurrentPlacements: (...args: unknown[]) => loadCurrentPlacements(...args),
}));

import type { CurrentPlacement } from "@/features/inventory/services/serial-placement";
import { placeServiceCenterUnits } from "@/features/service-center-ops/services/service-center-placement";

function placement(overrides: Partial<CurrentPlacement>): CurrentPlacement {
  return {
    table: "service_center",
    id: "row",
    serialNumberId: "s1",
    serialNo: "SN1",
    tenantId: "t1",
    place: "SC Main",
    branchId: null,
    warehouseId: null,
    warehouseLocationId: null,
    serviceCenterId: "sc1",
    serviceCenterLocationId: "loc1",
    statusCode: "DIT",
    ...overrides,
  };
}

function fakeTx() {
  return {
    $queryRaw: jest.fn(),
    branchInventory: {},
    warehouseInventory: {},
    serviceCenterInventory: { updateMany: jest.fn(), createMany: jest.fn() },
  };
}

const INPUT = {
  tenantId: "t1",
  serviceCenterId: "sc1",
  serviceCenterLocationId: "loc1",
  statusCodeId: "stk",
};

describe("placeServiceCenterUnits", () => {
  beforeEach(() => {
    lockSerialNumbers.mockReset();
    loadCurrentPlacements.mockReset();
  });

  it("updates rows already at the location and inserts the rest in one query each", async () => {
    loadCurrentPlacements.mockResolvedValue([placement({ id: "row-s1", serialNumberId: "s1" })]);
    const tx = fakeTx();

    await placeServiceCenterUnits(tx as never, { ...INPUT, serialNumberIds: ["s1", "s2", "s3", "s2"] });

    expect(lockSerialNumbers).toHaveBeenCalledTimes(1);
    expect(lockSerialNumbers).toHaveBeenCalledWith(tx, ["s1", "s2", "s3"]);
    expect(tx.serviceCenterInventory.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["row-s1"] } },
      data: { statusCodeId: "stk", serviceCenterId: "sc1" },
    });
    expect(tx.serviceCenterInventory.createMany).toHaveBeenCalledWith({
      data: ["s2", "s3"].map((serialNumberId) => ({
        tenantId: "t1",
        serviceCenterId: "sc1",
        serviceCenterLocationId: "loc1",
        serialNumberId,
        statusCodeId: "stk",
      })),
    });
  });

  it("refuses a serial placed anywhere else and writes nothing", async () => {
    loadCurrentPlacements.mockResolvedValue([
      placement({ table: "branch", id: "b1", serialNumberId: "s2", serialNo: "SN2", place: "Branch A" }),
    ]);
    const tx = fakeTx();

    await expect(
      placeServiceCenterUnits(tx as never, { ...INPUT, serialNumberIds: ["s1", "s2"] }),
    ).rejects.toThrow("SN2 is already at Branch A.");
    expect(tx.serviceCenterInventory.updateMany).not.toHaveBeenCalled();
    expect(tx.serviceCenterInventory.createMany).not.toHaveBeenCalled();
  });
});
