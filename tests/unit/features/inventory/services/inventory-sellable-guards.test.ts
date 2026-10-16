jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchInventory: {
      findFirst: jest.fn(),
    },
  },
}));

import {
  assertSerialSellableAtStockSource,
} from "@/features/inventory/services/inventory-sellable-guards";
import { prisma } from "@/lib/database/client";

const findFirst = prisma.branchInventory.findFirst as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("assertSerialSellableAtStockSource", () => {
  const baseInput = {
    tenantId: "t1",
    serialNumberId: "sn1",
    stockBranchId: "b1",
    stkCodeId: "stk-id",
  };

  it("throws when unit is DEF", async () => {
    findFirst.mockResolvedValue({
      statusCodeId: "def-id",
      statusCode: { code: "DEF" },
      serialNumber: { serialNo: "SN-001" },
      defectReports: [],
    });

    await expect(
      assertSerialSellableAtStockSource(prisma, baseInput),
    ).rejects.toThrow(/defective \(DEF\)/);
  });

  it("throws when pending defect inspection is open", async () => {
    findFirst.mockResolvedValue({
      statusCodeId: "stk-id",
      statusCode: { code: "STK" },
      serialNumber: { serialNo: "SN-002" },
      defectReports: [{ id: "r1" }],
    });

    await expect(
      assertSerialSellableAtStockSource(prisma, baseInput),
    ).rejects.toThrow(/pending defect inspection/);
  });

  it("passes for sellable STK without open defect report", async () => {
    findFirst.mockResolvedValue({
      statusCodeId: "stk-id",
      statusCode: { code: "STK" },
      serialNumber: { serialNo: "SN-003" },
      defectReports: [],
    });

    await expect(
      assertSerialSellableAtStockSource(prisma, baseInput),
    ).resolves.toBeUndefined();
  });
});
