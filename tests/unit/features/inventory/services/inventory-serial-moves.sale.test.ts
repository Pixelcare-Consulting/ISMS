jest.mock("@/lib/database/client", () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([]),
    branchInventory: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    stockCountLine: {
      findFirst: jest.fn(),
    },
  },
}));

import {
  markSerialSoldFromStockSource,
  SERIAL_SOLD_OR_RESERVED_AFTER_LOOKUP,
} from "@/features/inventory/services/inventory-serial-moves";
import { prisma } from "@/lib/database/client";

const findFirst = prisma.branchInventory.findFirst as jest.Mock;
const updateMany = prisma.branchInventory.updateMany as jest.Mock;
const frozenLookup = prisma.stockCountLine.findFirst as jest.Mock;

const moveInput = {
  tenantId: "t1",
  serialNumberId: "sn-1",
  stockBranchId: "source-1",
  soldBranchId: "sold-1",
  stkCodeId: "stk-id",
  targetStatusCodeId: "sld-id",
  updatedById: "user-1",
  expectedModelId: "model-1",
};

beforeEach(() => {
  jest.clearAllMocks();
  frozenLookup.mockResolvedValue(null);
});

describe("markSerialSoldFromStockSource", () => {
  it("throws the conflict message when the conditional STK update matches zero rows", async () => {
    findFirst.mockResolvedValue({
      statusCodeId: "stk-id",
      statusCode: { code: "STK" },
      serialNumber: { serialNo: "SN-1", modelId: "model-1" },
      defectReports: [],
    });
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      markSerialSoldFromStockSource(prisma, moveInput),
    ).rejects.toThrow(SERIAL_SOLD_OR_RESERVED_AFTER_LOOKUP);

    expect(SERIAL_SOLD_OR_RESERVED_AFTER_LOOKUP).toBe(
      "This unit was sold or reserved after lookup",
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        serialNumberId: "sn-1",
        branchId: "source-1",
        statusCodeId: "stk-id",
      },
      data: {
        statusCodeId: "sld-id",
        updatedById: "user-1",
        branchId: "sold-1",
      },
    });
  });

  it("does not update inventory when the serial model does not match", async () => {
    findFirst.mockResolvedValue({
      statusCodeId: "stk-id",
      statusCode: { code: "STK" },
      serialNumber: { serialNo: "SN-9", modelId: "other-model" },
      defectReports: [],
    });

    await expect(
      markSerialSoldFromStockSource(prisma, moveInput),
    ).rejects.toThrow("SN-9 does not match the selected model");
    expect(updateMany).not.toHaveBeenCalled();
  });
});
