jest.mock("@/lib/database/client", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    branchInventory: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    branchPlanogram: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { inventoryGroupRepository } from "@/features/inventory/repositories/inventory-group.repository";
import { prisma } from "@/lib/database/client";

const queryRaw = prisma.$queryRaw as jest.Mock;
const findMany = prisma.branchInventory.findMany as jest.Mock;
const count = prisma.branchInventory.count as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("inventoryGroupRepository.listBranchGroups", () => {
  it("returns SQL aggregates mapped to branch group rows", async () => {
    queryRaw
      .mockResolvedValueOnce([
        {
          branch_id: "b1",
          branch_name: "Branch One",
          branch_sap_code: "B1",
          stk: 4,
          def: 1,
          rsv: 0,
          pending_inspection: 0,
          status_counts: { DIT: 1, STK: 4, SLD: 2, DEF: 1, FW: 0 },
        },
      ])
      .mockResolvedValueOnce([{ count: 1 }]);

    const page = await inventoryGroupRepository.listBranchGroups(
      "t1",
      ["b1"],
      { page: 1, limit: 10 },
      { q: "SN-001" },
      [
        { id: "dit", code: "DIT" },
        { id: "stk", code: "STK" },
        { id: "sld", code: "SLD" },
        { id: "def", code: "DEF" },
        { id: "fw", code: "FW" },
      ],
    );

    expect(page.total).toBe(1);
    expect(page.items[0]).toEqual({
      branchId: "b1",
      branchName: "Branch One",
      branchSapCode: "B1",
      available: 4,
      defective: 1,
      reserved: 0,
      pendingInspection: 0,
      notStockedIn: 0,
      statusCounts: { DIT: 1, STK: 4, SLD: 2, DEF: 1, FW: 0 },
      total: 5,
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("returns empty when AOR has no branches", async () => {
    const page = await inventoryGroupRepository.listBranchGroups(
      "t1",
      [],
      { page: 1, limit: 10 },
    );
    expect(page.items).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("inventoryGroupRepository.listGroupSerials", () => {
  it("scopes serial rows to branch, model, and grouped status codes", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await inventoryGroupRepository.listGroupSerials(
      "t1",
      ["b1"],
      { page: 1, limit: 25 },
      { branchId: "b1", modelId: "m1", q: "X" },
      [
        { id: "dit", code: "DIT" },
        { id: "stk", code: "STK" },
        { id: "sld", code: "SLD" },
        { id: "ofs", code: "OFS" },
        { id: "rsv", code: "RSV" },
        { id: "def", code: "DEF" },
        { id: "fpo", code: "FPO" },
        { id: "fw", code: "FW" },
      ],
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              branchId: "b1",
              serialNumber: expect.objectContaining({ modelId: "m1" }),
              statusCodeId: {
                in: ["dit", "stk", "sld", "ofs", "rsv", "def", "fpo", "fw"],
              },
            }),
          ]),
        }),
      }),
    );
  });
});
