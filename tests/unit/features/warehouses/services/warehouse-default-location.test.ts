jest.mock("@/features/audit/services/audit.service", () => ({ auditService: { log: jest.fn() } }));
jest.mock("@/features/warehouses/repositories/warehouse.repository", () => ({
  warehouseRepository: { findById: jest.fn(), setDefaultLocation: jest.fn() },
}));

import { auditService } from "@/features/audit/services/audit.service";
import { warehouseRepository } from "@/features/warehouses/repositories/warehouse.repository";
import { warehouseService } from "@/features/warehouses/services/warehouse.service";

const findById = warehouseRepository.findById as jest.Mock;
const setDefaultLocation = warehouseRepository.setDefaultLocation as jest.Mock;
const log = auditService.log as jest.Mock;
const base = { tenantId: "t1", actorUserId: "u1", warehouseId: "w1" };

beforeEach(() => {
  jest.clearAllMocks();
  findById.mockResolvedValue({
    id: "w1",
    code: "W1",
    locations: [
      { id: "l1", code: "A1", name: "Aisle 1", isDefault: true },
      { id: "l2", code: "B2", name: "Bin 2", isDefault: false },
    ],
  });
  setDefaultLocation.mockResolvedValue(1);
});

it("moves the default to the ticked location and logs it", async () => {
  await warehouseService.setDefaultLocation({ ...base, locationId: "l2", isDefault: true });

  expect(setDefaultLocation).toHaveBeenCalledWith("w1", "l2");
  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "warehouse.location_default_changed",
      entityId: "l2",
      metadata: { warehouseCode: "W1", locationCode: "B2", isDefault: true },
    }),
  );
});

it("leaves the warehouse with no default when the tick is cleared", async () => {
  await warehouseService.setDefaultLocation({ ...base, locationId: "l1", isDefault: false });

  expect(setDefaultLocation).toHaveBeenCalledWith("w1", null);
});

it("does nothing when the location is already in that state", async () => {
  await warehouseService.setDefaultLocation({ ...base, locationId: "l1", isDefault: true });

  expect(setDefaultLocation).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it("refuses a location from another warehouse", async () => {
  await expect(
    warehouseService.setDefaultLocation({ ...base, locationId: "other", isDefault: true }),
  ).rejects.toThrow("Location not found");
  expect(setDefaultLocation).not.toHaveBeenCalled();
});

it("reports a default moved by someone else a moment ago", async () => {
  const { Prisma } = jest.requireActual("@/lib/database/generated/prisma/client");
  setDefaultLocation.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "x" }),
  );

  await expect(
    warehouseService.setDefaultLocation({ ...base, locationId: "l2", isDefault: true }),
  ).rejects.toThrow("The default location just changed. Reload and try again.");
  expect(log).not.toHaveBeenCalled();
});
