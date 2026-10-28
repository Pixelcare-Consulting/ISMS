jest.mock("@/features/audit/services/audit.service", () => ({ auditService: { log: jest.fn() } }));
jest.mock("@/features/warehouses/repositories/warehouse.repository", () => ({
  warehouseRepository: { findById: jest.fn(), addLocation: jest.fn() },
}));

import { warehouseRepository } from "@/features/warehouses/repositories/warehouse.repository";
import { warehouseService } from "@/features/warehouses/services/warehouse.service";

const findById = warehouseRepository.findById as jest.Mock;
const addLocation = warehouseRepository.addLocation as jest.Mock;
const base = { tenantId: "t1", actorUserId: "u1", warehouseId: "w1" };

beforeEach(() => {
  jest.clearAllMocks();
  findById.mockResolvedValue({ id: "w1", code: "W1", locations: [{ id: "l1", code: "A1", name: "Aisle 1" }] });
  addLocation.mockImplementation(async (_id: string, data: { code: string }) => ({ id: "l2", ...data }));
});

it("refuses a code already in the warehouse, ignoring case and spaces", async () => {
  await expect(warehouseService.addLocation({ ...base, code: " a1 ", name: "Other" })).rejects.toThrow(
    "Location code a1 already exists in this warehouse.",
  );
  expect(addLocation).not.toHaveBeenCalled();
});

it("allows a repeated name under a new code, saved trimmed", async () => {
  await warehouseService.addLocation({ ...base, code: " A2 ", name: " Aisle 1 " });
  expect(addLocation).toHaveBeenCalledWith("w1", { code: "A2", name: "Aisle 1" });
});

it("reports a code added by someone else a moment ago as a duplicate", async () => {
  const { Prisma } = jest.requireActual("@/lib/database/generated/prisma/client");
  addLocation.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "x" }),
  );
  await expect(warehouseService.addLocation({ ...base, code: "B9", name: "Bin 9" })).rejects.toThrow(
    "Location code B9 already exists in this warehouse.",
  );
});
