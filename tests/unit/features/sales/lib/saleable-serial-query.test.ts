jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchInventory: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { sellableStkDefectReportsFilter } from "@/features/inventory/services/inventory-sellable-guards";
import {
  querySaleableSerials,
  SALEABLE_SERIAL_MAX_LIMIT,
} from "@/features/sales/lib/saleable-serial-query";
import { prisma } from "@/lib/database/client";

const count = prisma.branchInventory.count as jest.Mock;
const findMany = prisma.branchInventory.findMany as jest.Mock;

type CountArgs = { where: Record<string, unknown> };
type FindArgs = CountArgs & {
  skip: number;
  take: number;
  orderBy: unknown;
  select: unknown;
};

const lateSerial = {
  serialNumber: {
    id: "sn-late",
    serialNo: "ZZZ-99999",
    modelId: "model-1",
    model: { skuCode: "SKU-1", name: "Model One" },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  count.mockResolvedValue(1);
  findMany.mockResolvedValue([lateSerial]);
});

describe("querySaleableSerials", () => {
  const base = {
    tenantId: "tenant-1",
    stockBranchId: "source-1",
    stkCodeId: "stk-id",
  };

  it("returns an empty page and does not query when modelId is missing", async () => {
    const result = await querySaleableSerials(prisma, {
      ...base,
      modelId: "   ",
    });

    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 1,
    });
    expect(count).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("puts model, source, STK, and defect filters in where before skip and take", async () => {
    await querySaleableSerials(prisma, {
      ...base,
      modelId: "model-1",
      page: 2,
      limit: 10,
    });

    const countArgs = count.mock.calls[0][0] as CountArgs;
    const findArgs = findMany.mock.calls[0][0] as FindArgs;

    expect(countArgs).toEqual({ where: findArgs.where });
    expect(findArgs.where).toEqual({
      tenantId: "tenant-1",
      branchId: "source-1",
      statusCodeId: "stk-id",
      defectReports: sellableStkDefectReportsFilter,
      serialNumber: { modelId: "model-1" },
    });
    expect(findArgs.skip).toBe(10);
    expect(findArgs.take).toBe(10);
    expect(findArgs.orderBy).toEqual([
      { serialNumber: { serialNo: "asc" } },
      { id: "asc" },
    ]);
  });

  it("finds a searched serial from the database filter instead of a first-500 window", async () => {
    const result = await querySaleableSerials(prisma, {
      ...base,
      modelId: "model-1",
      search: "  zzz-99999  ",
    });

    const findArgs = findMany.mock.calls[0][0] as FindArgs;

    expect(findArgs.where).toEqual({
      tenantId: "tenant-1",
      branchId: "source-1",
      statusCodeId: "stk-id",
      defectReports: sellableStkDefectReportsFilter,
      serialNumber: {
        modelId: "model-1",
        serialNo: { contains: "zzz-99999", mode: "insensitive" },
      },
    });
    expect(findArgs.skip).toBe(0);
    expect(findArgs.take).toBe(25);
    expect(result.items).toEqual([
      {
        id: "sn-late",
        serialNo: "ZZZ-99999",
        modelId: "model-1",
        skuCode: "SKU-1",
        modelName: "Model One",
      },
    ]);
    expect(result).toMatchObject({ total: 1, page: 1, limit: 25, totalPages: 1 });
  });

  it("defaults the page size to 25 and caps it at 100", async () => {
    await querySaleableSerials(prisma, { ...base, modelId: "model-1", limit: 500 });

    const findArgs = findMany.mock.calls[0][0] as FindArgs;
    expect(SALEABLE_SERIAL_MAX_LIMIT).toBe(100);
    expect(findArgs.take).toBe(100);
    expect(findArgs.skip).toBe(0);
  });

  it("keeps a sold unit out of the list by requiring STK in the where", async () => {
    await querySaleableSerials(prisma, { ...base, modelId: "model-1" });

    const findArgs = findMany.mock.calls[0][0] as FindArgs;
    expect(findArgs.where.statusCodeId).toBe("stk-id");
  });
});
