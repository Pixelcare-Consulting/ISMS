jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchInventory: {
      findFirst: jest.fn(),
    },
  },
}));

import { assertSerialSellableAtStockSource } from "@/features/inventory/services/inventory-sellable-guards";
import { prisma } from "@/lib/database/client";

const findFirst = prisma.branchInventory.findFirst as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("assertSerialSellableAtStockSource sale serial rules", () => {
  const baseInput = {
    tenantId: "t1",
    serialNumberId: "sn1",
    stockBranchId: "source-1",
    stkCodeId: "stk-id",
    expectedModelId: "model-1",
  };

  it("looks up the unit at the stock source before accepting it", async () => {
    findFirst.mockResolvedValue({
      statusCodeId: "stk-id",
      statusCode: { code: "STK" },
      serialNumber: { serialNo: "SN-OK", modelId: "model-1" },
      defectReports: [],
    });

    await expect(
      assertSerialSellableAtStockSource(prisma, baseInput),
    ).resolves.toBeUndefined();

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        serialNumberId: "sn1",
        branchId: "source-1",
      },
      select: {
        statusCodeId: true,
        statusCode: { select: { code: true } },
        serialNumber: { select: { serialNo: true, modelId: true } },
        defectReports: {
          where: { status: "pending_inspection" },
          select: { id: true },
          take: 1,
        },
      },
    });
  });

  it("rejects a unit that is not at the stock source", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      assertSerialSellableAtStockSource(prisma, baseInput),
    ).rejects.toThrow(
      "Serial is not in sellable stock at the stock source branch",
    );
  });

  it("rejects a unit that is not STK", async () => {
    findFirst.mockResolvedValue({
      statusCodeId: "sld-id",
      statusCode: { code: "SLD" },
      serialNumber: { serialNo: "SN-SOLD", modelId: "model-1" },
      defectReports: [],
    });

    await expect(
      assertSerialSellableAtStockSource(prisma, baseInput),
    ).rejects.toThrow(
      "SN-SOLD is not in sellable stock at the stock source branch",
    );
  });

  it("rejects a pending defect inspection", async () => {
    findFirst.mockResolvedValue({
      statusCodeId: "stk-id",
      statusCode: { code: "STK" },
      serialNumber: { serialNo: "SN-DEF", modelId: "model-1" },
      defectReports: [{ id: "report-1" }],
    });

    await expect(
      assertSerialSellableAtStockSource(prisma, baseInput),
    ).rejects.toThrow(
      "SN-DEF is pending defect inspection and cannot be sold or reserved",
    );
  });

  it("rejects a serial whose model does not match the sale line", async () => {
    findFirst.mockResolvedValue({
      statusCodeId: "stk-id",
      statusCode: { code: "STK" },
      serialNumber: { serialNo: "SN-9", modelId: "other-model" },
      defectReports: [],
    });

    await expect(
      assertSerialSellableAtStockSource(prisma, baseInput),
    ).rejects.toThrow("SN-9 does not match the selected model");
  });
});
