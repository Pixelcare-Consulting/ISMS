jest.mock("@/lib/database/client", () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const { prisma: db } = jest.requireMock("@/lib/database/client") as {
        prisma: unknown;
      };
      return fn(db);
    }),
    branch: { findMany: jest.fn() },
    warehouse: { findMany: jest.fn() },
    warehouseInventory: { findMany: jest.fn() },
    serviceCenterInventory: { findMany: jest.fn() },
    serialNumber: { findMany: jest.fn() },
    branchInventory: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));
jest.mock("@/features/reason-status/repositories/reason-status.repository", () => ({
  reasonStatusRepository: { findCodeId: jest.fn() },
}));
jest.mock("@/lib/shared/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));

import { prisma } from "@/lib/database/client";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import {
  partitionOnHandByMaster,
  replicateOnHandSerialsToStk,
} from "@/features/serial-numbers/services/serial-stock-replicate";

const findCodeId = reasonStatusRepository.findCodeId as jest.Mock;
const branchFindMany = prisma.branch.findMany as jest.Mock;
const warehouseFindMany = prisma.warehouse.findMany as jest.Mock;
const serialFindMany = prisma.serialNumber.findMany as jest.Mock;
const inventoryCreate = prisma.branchInventory.create as jest.Mock;
const inventoryUpdate = prisma.branchInventory.update as jest.Mock;
const inventoryFindMany = prisma.branchInventory.findMany as jest.Mock;
const warehouseInventoryFindMany = prisma.warehouseInventory.findMany as jest.Mock;
const serviceInventoryFindMany = prisma.serviceCenterInventory.findMany as jest.Mock;

describe("partitionOnHandByMaster", () => {
  it("dedupes serials and drops blank warehouse codes", () => {
    expect(
      partitionOnHandByMaster(
        [
          { serialNo: " SN1 ", warehouseCode: " ABL001 " },
          { serialNo: "SN1", warehouseCode: "ABL001" },
          { serialNo: "SN2", warehouseCode: "   " },
        ],
        new Set(["ABL001"]),
      ),
    ).toEqual({
      known: [{ serialNo: "SN1", warehouseCode: "ABL001" }],
      unknownSerialNos: ["SN2"],
    });
  });
});

describe("replicateOnHandSerialsToStk", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findCodeId.mockResolvedValue({ id: "stk-1" });
    inventoryFindMany.mockResolvedValue([]);
    warehouseInventoryFindMany.mockResolvedValue([]);
    serviceInventoryFindMany.mockResolvedValue([]);
  });

  it("creates STK when the serial has no branch inventory yet", async () => {
    branchFindMany.mockResolvedValue([{ id: "b1", sapCode: "ABL001" }]);
    warehouseFindMany.mockResolvedValue([]);
    serialFindMany.mockResolvedValue([{ id: "sn1", serialNo: "SN1" }]);
    inventoryCreate.mockResolvedValue({});

    const result = await replicateOnHandSerialsToStk("t1", [
      { serialNo: "SN1", warehouseCode: "ABL001" },
    ]);

    expect(inventoryCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "t1",
        branchId: "b1",
        serialNumberId: "sn1",
        statusCodeId: "stk-1",
      },
    });
    expect(result).toEqual({ created: 1, moved: 0, skipped: 0 });
  });

  it("moves an existing STK row to the resolved branch", async () => {
    branchFindMany.mockResolvedValue([{ id: "b2", sapCode: "ABL001" }]);
    warehouseFindMany.mockResolvedValue([]);
    serialFindMany.mockResolvedValue([{ id: "sn1", serialNo: "SN1" }]);
    inventoryFindMany.mockResolvedValue([
      {
        id: "inv1",
        tenantId: "t1",
        serialNumberId: "sn1",
        branchId: "b-old",
        branch: { name: "Old branch" },
        statusCode: { code: "STK" },
        serialNumber: { serialNo: "SN1" },
      },
    ]);
    inventoryUpdate.mockResolvedValue({});

    const result = await replicateOnHandSerialsToStk("t1", [
      { serialNo: "SN1", warehouseCode: "ABL001" },
    ]);

    expect(inventoryUpdate).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { branchId: "b2", statusCodeId: "stk-1" },
    });
    expect(result).toEqual({ created: 0, moved: 1, skipped: 0 });
  });

  it("leaves non-STK placements alone and skips warehouse-only codes", async () => {
    branchFindMany.mockResolvedValue([]);
    warehouseFindMany.mockResolvedValue([
      { code: "PASIG-MAIN", primaryBranches: [] },
      {
        code: "FWH09DAV",
        primaryBranches: [{ id: "b1", sapCode: "DAV001" }],
      },
    ]);
    serialFindMany.mockResolvedValue([{ id: "sn1", serialNo: "SN1" }]);
    inventoryFindMany.mockResolvedValue([
      {
        id: "inv1",
        tenantId: "t1",
        serialNumberId: "sn1",
        branchId: "b1",
        branch: { name: "Davao" },
        statusCode: { code: "SLD" },
        serialNumber: { serialNo: "SN1" },
      },
    ]);

    const result = await replicateOnHandSerialsToStk("t1", [
      { serialNo: "SN-WH", warehouseCode: "PASIG-MAIN" },
      { serialNo: "SN1", warehouseCode: "FWH09DAV" },
    ]);

    expect(inventoryCreate).not.toHaveBeenCalled();
    expect(inventoryUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, moved: 0, skipped: 2 });
  });
});
