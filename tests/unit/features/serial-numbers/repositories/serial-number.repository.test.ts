jest.mock("@/lib/database/client", () => ({
  prisma: {
    $executeRaw: jest.fn().mockResolvedValue(0),
    productModel: { findMany: jest.fn(), count: jest.fn() },
    serialNumber: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn(),
    },
    branchInventory: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    branch: { findMany: jest.fn().mockResolvedValue([]) },
    warehouse: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock("@/features/reason-status/repositories/reason-status.repository", () => ({
  reasonStatusRepository: {
    findCodeId: jest.fn(),
  },
}));

import { MODEL_SERIAL_PAGE_SIZE } from "@/features/serial-numbers/constants/model-serial-page";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { serialNumberRepository } from "@/features/serial-numbers/repositories/serial-number.repository";
import { prisma } from "@/lib/database/client";

const productModels = prisma.productModel.findMany as jest.Mock;
const productModelCount = prisma.productModel.count as jest.Mock;
const groupBy = prisma.serialNumber.groupBy as jest.Mock;
const updateMany = prisma.serialNumber.updateMany as jest.Mock;
const deleteMany = prisma.serialNumber.deleteMany as jest.Mock;
const serialCount = prisma.serialNumber.count as jest.Mock;
const serialRows = prisma.serialNumber.findMany as jest.Mock;
const findFirst = prisma.serialNumber.findFirst as jest.Mock;
const createMany = prisma.serialNumber.createMany as jest.Mock;
const executeRaw = prisma.$executeRaw as jest.Mock;
const branchCount = prisma.branchInventory.count as jest.Mock;
const branchRows = prisma.branchInventory.findMany as jest.Mock;
const branchFindMany = prisma.branch.findMany as jest.Mock;
const warehouseFindMany = prisma.warehouse.findMany as jest.Mock;
const findCodeId = reasonStatusRepository.findCodeId as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  branchFindMany.mockResolvedValue([]);
  warehouseFindMany.mockResolvedValue([]);
  groupBy.mockResolvedValue([]);
});

describe("list", () => {
  it("returns one row per model still in Master data and pages by models", async () => {
    productModels.mockResolvedValue([
      { id: "m1", skuCode: "TEST-TV-55", name: "Test TV 55", brand: null },
    ]);
    productModelCount.mockResolvedValue(1);

    const page = await serialNumberRepository.list("t1", { page: 1, limit: 10 }, { q: "TV-006" });

    expect(page.total).toBe(1);
    expect(page.items).toEqual([
      { id: "m1", skuCode: "TEST-TV-55", name: "Test TV 55", brand: null },
    ]);
    expect(productModels).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "t1",
          deletedAt: null,
          AND: [
            { serialNumbers: { some: { tenantId: "t1", deletedAt: null } } },
            {
              OR: [
                { skuCode: { contains: "TV-006", mode: "insensitive" } },
                { name: { contains: "TV-006", mode: "insensitive" } },
                {
                  serialNumbers: {
                    some: {
                      tenantId: "t1",
                      deletedAt: null,
                      serialNo: { contains: "TV-006", mode: "insensitive" },
                    },
                  },
                },
              ],
            },
          ],
        },
        orderBy: { skuCode: "asc" },
      }),
    );
    expect(productModelCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ tenantId: "t1", deletedAt: null }),
    });
  });

  it("can narrow models to those with a serial in the chosen status", async () => {
    productModels.mockResolvedValue([]);
    productModelCount.mockResolvedValue(0);

    await serialNumberRepository.list("t1", { page: 1, limit: 10 }, { status: "inactive" });

    expect(productModels).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "t1",
          deletedAt: null,
          AND: [
            {
              serialNumbers: {
                some: { tenantId: "t1", deletedAt: null, recordStatus: "inactive" },
              },
            },
          ],
        },
      }),
    );
  });
});

describe("model counts", () => {
  it("counts models still in Master data, the same set the table lists", async () => {
    productModelCount.mockResolvedValue(5);

    await serialNumberRepository.countListedModels("t1");
    await serialNumberRepository.countListedModels("t1", "active");
    await serialNumberRepository.countListedModels("t1", "inactive");

    expect(productModelCount).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: "t1",
        deletedAt: null,
        AND: [{ serialNumbers: { some: { tenantId: "t1", deletedAt: null } } }],
      },
    });
    expect(productModelCount).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: "t1",
        deletedAt: null,
        AND: [
          {
            serialNumbers: {
              some: { tenantId: "t1", deletedAt: null, recordStatus: "active" },
            },
          },
        ],
      },
    });
    expect(productModelCount).toHaveBeenNthCalledWith(3, {
      where: {
        tenantId: "t1",
        deletedAt: null,
        AND: [
          {
            serialNumbers: {
              some: { tenantId: "t1", deletedAt: null, recordStatus: "inactive" },
            },
          },
        ],
      },
    });
    expect(serialCount).not.toHaveBeenCalled();
  });
});

describe("latest SAP sync", () => {
  it("counts every live serial and uses the later sync time", async () => {
    const serialSync = new Date("2026-10-08T02:00:00.000Z");
    const onHandSync = new Date("2026-10-08T05:00:00.000Z");
    groupBy.mockResolvedValue([
      {
        modelId: "m1",
        _max: { sapSyncedAt: serialSync, sapOnHandSyncedAt: onHandSync },
        _count: { id: 10 },
      },
      {
        modelId: "m2",
        _max: { sapSyncedAt: null, sapOnHandSyncedAt: null },
        _count: { id: 1 },
      },
    ]);

    const summaries = await serialNumberRepository.latestSapSyncByModel("t1", ["m1", "m2", "m3"]);

    expect(summaries).toEqual({
      m1: { lastSyncedAt: onHandSync, serialCount: 10 },
      m2: { lastSyncedAt: null, serialCount: 1 },
      m3: { lastSyncedAt: null, serialCount: 0 },
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ["modelId"],
      where: {
        tenantId: "t1",
        deletedAt: null,
        modelId: { in: ["m1", "m2", "m3"] },
        model: { deletedAt: null },
      },
      _max: { sapSyncedAt: true, sapOnHandSyncedAt: true },
      _count: { id: true },
    });
  });

  it("skips the query when the page has no models", async () => {
    const summaries = await serialNumberRepository.latestSapSyncByModel("t1", []);
    expect(summaries).toEqual({});
    expect(groupBy).not.toHaveBeenCalled();
  });
});

describe("retireUnseenSapSerials", () => {
  it("deletes unreferenced serials of removed models and soft-deletes the ones a record still points at", async () => {
    deleteMany.mockResolvedValue({ count: 4 });
    updateMany.mockResolvedValue({ count: 1 });
    const passMark = new Date("2026-10-08T00:00:00.000Z");

    const removed = await serialNumberRepository.retireUnseenSapSerials("t1", passMark);

    expect(removed).toBe(5);
    const hardWhere = deleteMany.mock.calls[0][0].where;
    expect(hardWhere.tenantId).toBe("t1");
    expect(hardWhere.deletedAt).toBeNull();
    expect(hardWhere.model).toEqual({ deletedAt: { not: null } });
    expect(hardWhere.history).toEqual({ none: {} });
    expect(hardWhere.branchInventories).toEqual({ none: {} });
    expect(hardWhere.stockCountLines).toEqual({ none: {} });
    expect(hardWhere.NOT.OR).toEqual(
      expect.arrayContaining([
        { stockCountLines: { some: { session: { status: { not: "closed" } } } } },
        {
          deliveryLines: {
            some: {
              delivery: {
                statusCode: { code: { in: ["requested", "approved", "pending", "partial"] } },
              },
            },
          },
        },
      ]),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        deletedAt: null,
        OR: [{ sapSyncedAt: null }, { sapSyncedAt: { lt: passMark } }],
        model: { deletedAt: { not: null } },
        NOT: hardWhere.NOT,
      },
      data: { deletedAt: expect.any(Date), recordStatus: "inactive" },
    });
    expect(updateMany.mock.calls[0][0].where.history).toBeUndefined();
  });
});

describe("listSapSyncModelKeys", () => {
  it("walks only models still in Master data", async () => {
    productModels.mockResolvedValue([{ id: "m1", skuCode: "LIVE" }]);

    await serialNumberRepository.listSapSyncModelKeys("t1");

    expect(productModels).toHaveBeenCalledWith({
      where: { tenantId: "t1", deletedAt: null },
      select: { id: true, skuCode: true },
    });
  });
});

describe("setSapOnHandFlags", () => {
  it("marks on-hand serials with their warehouse and clears the rest of the page", async () => {
    await serialNumberRepository.setSapOnHandFlags(
      "t1",
      ["m1"],
      [
        { serialNo: "SN1", warehouseCode: "ABL001" },
        { serialNo: "SN3", warehouseCode: "ABL001" },
        { serialNo: "SN4", warehouseCode: " ABB001 " },
      ],
      ["SN2"],
    );

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: "t1",
        deletedAt: null,
        modelId: { in: ["m1"] },
        serialNo: { in: ["SN1", "SN3"] },
      },
      data: { sapOnHand: true, sapOnHandSyncedAt: expect.any(Date), sapWhsCode: "ABL001" },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: "t1",
        deletedAt: null,
        modelId: { in: ["m1"] },
        serialNo: { in: ["SN4"] },
      },
      data: { sapOnHand: true, sapOnHandSyncedAt: expect.any(Date), sapWhsCode: "ABB001" },
    });
    expect(updateMany).toHaveBeenNthCalledWith(3, {
      where: {
        tenantId: "t1",
        deletedAt: null,
        modelId: { in: ["m1"] },
        serialNo: { in: ["SN2"] },
      },
      data: { sapOnHand: false, sapOnHandSyncedAt: expect.any(Date), sapWhsCode: null },
    });
  });

  it("does not write flags when no allow-listed model is on the page", async () => {
    await serialNumberRepository.setSapOnHandFlags("t1", [], ["SN1"], ["SN2"]);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("model stock figures", () => {
  const planogramStockWhere = (modelId: string) => ({
    tenantId: "t1",
    statusCodeId: "stk",
    serialNumber: { modelId, deletedAt: null },
    branch: { branchPlanograms: { some: { tenantId: "t1", modelId } } },
  });

  it("counts SAP on-hand only after a stamp, and Stock only on a planogram branch", async () => {
    groupBy.mockImplementation(async (args: { where: { sapOnHand?: boolean } }) => {
      if (args.where.sapOnHand === true) {
        return [{ modelId: "m1", _count: { id: 4 } }];
      }
      return [
        { modelId: "m1", _count: { id: 9 } },
        { modelId: "m3", _count: { id: 2 } },
      ];
    });
    findCodeId.mockResolvedValue({ id: "stk" });
    branchCount.mockImplementation(async (args: { where: { serialNumber: { modelId: string } } }) => {
      if (args.where.serialNumber.modelId === "m1") return 3;
      if (args.where.serialNumber.modelId === "m3") return 1;
      return 0;
    });

    const figures = await serialNumberRepository.modelStockFigures("t1", ["m1", "m2", "m3"]);

    expect(figures).toEqual({
      m1: { sapOnHand: 4, branchQty: 3 },
      m2: { sapOnHand: null, branchQty: 0 },
      m3: { sapOnHand: 0, branchQty: 1 },
    });
    expect(findCodeId).toHaveBeenCalledWith("t1", "inventory_system", "STK");
    expect(branchCount).toHaveBeenCalledWith({ where: planogramStockWhere("m1") });
    expect(branchCount).toHaveBeenCalledWith({ where: planogramStockWhere("m2") });
  });

  it("leaves branch quantities at zero when Stock status is missing", async () => {
    groupBy.mockResolvedValue([]);
    findCodeId.mockResolvedValue(null);

    const figures = await serialNumberRepository.modelStockFigures("t1", ["m1"]);

    expect(figures.m1).toEqual({ sapOnHand: null, branchQty: 0 });
    expect(branchCount).not.toHaveBeenCalled();
  });

});

describe("applySapSyncPage", () => {
  it("keeps the SAP serial id without writing it as a serial field", async () => {
    serialRows.mockResolvedValue([
      { id: "s1", serialNo: "SN1", modelId: "m1", deletedAt: null },
      { id: "s3", serialNo: "SN3", modelId: "m1", deletedAt: null },
    ]);
    createMany.mockResolvedValue({ count: 1 });

    const result = await serialNumberRepository.applySapSyncPage("t1", [
      { serialNo: "SN1", modelId: "m1", docEntry: 11 },
      { serialNo: "SN2", modelId: "m1", docEntry: 12 },
      { serialNo: "SN3", modelId: "m1", docEntry: 0 },
    ]);

    expect(result).toMatchObject({ created: 1, updated: 0, unchanged: 2 });
    expect(createMany).toHaveBeenCalledWith({
      data: [{ tenantId: "t1", serialNo: "SN2", modelId: "m1", recordStatus: "active" }],
      skipDuplicates: true,
    });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe("listModelSerials", () => {
  beforeEach(() => {
    findFirst.mockResolvedValue({ id: "stamped" });
  });

  it("says on-hand has not been recorded and does not list the registry", async () => {
    findFirst.mockResolvedValue(null);

    const serials = await serialNumberRepository.listModelSerials("t1", "m1", 1);

    expect(serials).toEqual({
      items: [],
      total: 0,
      page: 1,
      totalPages: 1,
      onHandRecorded: false,
    });
    expect(serialCount).not.toHaveBeenCalled();
    expect(serialRows).not.toHaveBeenCalled();
  });

  it("returns one page of serials SAP currently has on hand", async () => {
    serialCount.mockResolvedValue(12);
    groupBy.mockResolvedValue([{ sapWhsCode: "01", _count: { id: 1 } }]);
    serialRows.mockResolvedValue([
      {
        id: "s1",
        serialNo: "TEST-TV-003",
        recordStatus: "active",
        sapWhsCode: null,
        branchInventories: [
          {
            branch: { id: "b-davao", sapCode: "ABF001", name: "Davao Test Branch" },
            statusCode: { code: "STK", name: "Stock", color: "emerald" },
          },
        ],
      },
      {
        id: "s2",
        serialNo: "TEST-TV-001",
        recordStatus: "inactive",
        sapWhsCode: "01",
        branchInventories: [],
      },
    ]);

    const serials = await serialNumberRepository.listModelSerials("t1", "m1", 2);

    expect(serialRows).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "t1",
          modelId: "m1",
          deletedAt: null,
          model: { deletedAt: null },
          sapOnHand: true,
        },
        orderBy: { serialNo: "asc" },
        skip: MODEL_SERIAL_PAGE_SIZE,
        take: MODEL_SERIAL_PAGE_SIZE,
      }),
    );
    expect(branchRows).not.toHaveBeenCalled();
    expect(branchFindMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", deletedAt: null, sapCode: { in: ["01"] } },
      select: { id: true, sapCode: true, name: true },
    });
    expect(serials.total).toBe(12);
    expect(serials.page).toBe(2);
    expect(serials.totalPages).toBe(2);
    expect(serials.onHandRecorded).toBe(true);
    expect(serialCount).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        modelId: "m1",
        deletedAt: null,
        model: { deletedAt: null },
        sapOnHand: true,
      },
    });
    expect(serials.items).toEqual([
      {
        id: "s1",
        serialNo: "TEST-TV-003",
        recordStatus: "active",
        branchCode: "ABF001",
        branchName: "Davao Test Branch",
        branchQty: 0,
        statusCode: { code: "STK", name: "Stock", color: "emerald" },
      },
      {
        id: "s2",
        serialNo: "TEST-TV-001",
        recordStatus: "inactive",
        branchCode: "01",
        branchName: null,
        branchQty: 1,
        statusCode: null,
      },
    ]);
  });

  it("shows the branch whose SAP code matches the warehouse, and the code when none does", async () => {
    serialCount.mockResolvedValue(2);
    groupBy.mockResolvedValue([
      { sapWhsCode: "ABL001", _count: { id: 40 } },
      { sapWhsCode: "ABE500", _count: { id: 3 } },
    ]);
    branchFindMany.mockResolvedValue([
      { id: "b-leg", sapCode: "ABL001", name: "ABENSON AYALA LEGASPI" },
    ]);
    serialRows.mockResolvedValue([
      {
        id: "s1",
        serialNo: "55QUHW01L012400458",
        recordStatus: "active",
        sapWhsCode: "ABL001",
        branchInventories: [],
      },
      {
        id: "s2",
        serialNo: "55QUHW01L012400616",
        recordStatus: "active",
        sapWhsCode: "ABE500",
        branchInventories: [],
      },
    ]);

    const serials = await serialNumberRepository.listModelSerials("t1", "m1", 1);

    expect(serials.items).toEqual([
      {
        id: "s1",
        serialNo: "55QUHW01L012400458",
        recordStatus: "active",
        branchCode: "ABL001",
        branchName: "ABENSON AYALA LEGASPI",
        branchQty: 40,
        statusCode: null,
      },
      {
        id: "s2",
        serialNo: "55QUHW01L012400616",
        recordStatus: "active",
        branchCode: "ABE500",
        branchName: null,
        branchQty: 3,
        statusCode: null,
      },
    ]);
  });

  it("filters a page by serial number or branch name", async () => {
    serialCount.mockResolvedValue(1);
    serialRows.mockResolvedValue([]);

    await serialNumberRepository.listModelSerials("t1", "m1", 1, "  tv-003 ");

    expect(branchFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        deletedAt: null,
        OR: [
          { sapCode: { contains: "tv-003", mode: "insensitive" } },
          { name: { contains: "tv-003", mode: "insensitive" } },
        ],
      },
      select: { sapCode: true, primaryWarehouse: { select: { code: true, deletedAt: true } } },
    });
    expect(serialCount).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        modelId: "m1",
        deletedAt: null,
        model: { deletedAt: null },
        sapOnHand: true,
        OR: [
          { serialNo: { contains: "tv-003", mode: "insensitive" } },
          {
            branchInventories: {
              some: {
                branch: {
                  OR: [
                    { name: { contains: "tv-003", mode: "insensitive" } },
                    { sapCode: { contains: "tv-003", mode: "insensitive" } },
                  ],
                },
              },
            },
          },
        ],
      },
    });
  });

  it("includes serials whose warehouse matches a branch code or name", async () => {
    serialCount.mockResolvedValue(1);
    serialRows.mockResolvedValue([]);
    branchFindMany.mockResolvedValue([{ sapCode: "ABL001" }]);

    await serialNumberRepository.listModelSerials("t1", "m1", 1, "legaspi");

    expect(serialCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ sapWhsCode: { in: ["ABL001"] } }]),
      }),
    });
  });

  it("shows the branch linked to a warehouse code and the on-hand qty at that branch", async () => {
    serialCount.mockResolvedValue(2);
    groupBy.mockResolvedValue([
      { sapWhsCode: "FWH09DAV", _count: { id: 40 } },
      { sapWhsCode: "FWH08CLB", _count: { id: 11 } },
    ]);
    warehouseFindMany.mockResolvedValue([
      {
        code: "FWH09DAV",
        primaryBranches: [{ id: "b-davao", sapCode: "ABP001", name: "ABENSON ABREEZA DAVAO" }],
      },
      {
        code: "FWH14P1F",
        primaryBranches: [],
      },
    ]);
    serialRows.mockResolvedValue([
      {
        id: "s1",
        serialNo: "55QUHW01L012400458",
        recordStatus: "active",
        sapWhsCode: "FWH09DAV",
        branchInventories: [],
      },
      {
        id: "s2",
        serialNo: "55QUHW01L012400616",
        recordStatus: "active",
        sapWhsCode: "FWH08CLB",
        branchInventories: [],
      },
    ]);

    const serials = await serialNumberRepository.listModelSerials("t1", "m1", 1);

    expect(serials.items).toEqual([
      {
        id: "s1",
        serialNo: "55QUHW01L012400458",
        recordStatus: "active",
        branchCode: "ABP001",
        branchName: "ABENSON ABREEZA DAVAO",
        branchQty: 40,
        statusCode: null,
      },
      {
        id: "s2",
        serialNo: "55QUHW01L012400616",
        recordStatus: "active",
        branchCode: "FWH08CLB",
        branchName: null,
        branchQty: 11,
        statusCode: null,
      },
    ]);
  });

  it("shows the warehouse itself when it is linked to more than one branch", async () => {
    serialCount.mockResolvedValue(1);
    groupBy.mockResolvedValue([{ sapWhsCode: "FWH09DAV", _count: { id: 8 } }]);
    warehouseFindMany.mockResolvedValue([
      {
        code: "FWH09DAV",
        name: "FTI DAVAO WAREHOUSE",
        primaryBranches: [
          { id: "b1", sapCode: "ABB001", name: "ABENSON ALTURAS BOHOL" },
          { id: "b2", sapCode: "ABP001", name: "ABENSON ABREEZA DAVAO" },
        ],
      },
    ]);
    serialRows.mockResolvedValue([
      {
        id: "s1",
        serialNo: "SN-SHARED",
        recordStatus: "active",
        sapWhsCode: "FWH09DAV",
        branchInventories: [],
      },
    ]);

    const serials = await serialNumberRepository.listModelSerials("t1", "m1", 1);

    expect(serials.items[0]).toMatchObject({
      branchCode: "FWH09DAV",
      branchName: "FTI DAVAO WAREHOUSE",
      branchQty: 8,
    });
  });
});
