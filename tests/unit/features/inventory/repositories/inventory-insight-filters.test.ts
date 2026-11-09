import { prisma } from "@/lib/database/client";
import { inventoryRepository } from "@/features/inventory/repositories/inventory.repository";

jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchInventory: { count: jest.fn(), groupBy: jest.fn() },
    branchPlanogram: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

const count = prisma.branchInventory.count as jest.Mock;
const groupBy = prisma.branchInventory.groupBy as jest.Mock;
const queryRaw = prisma.$queryRaw as jest.Mock;

beforeEach(() => {
  count.mockResolvedValue(3);
  groupBy.mockResolvedValue([]);
  queryRaw.mockResolvedValue([]);
});

describe("inventory dashboard card counts", () => {
  it("count every status in scope when nothing narrows them", async () => {
    await inventoryRepository.countAll("t1", ["b1", "b2"]);
    expect(count).toHaveBeenCalledWith({
      where: { tenantId: "t1", AND: [{ branchId: { in: ["b1", "b2"] } }] },
    });
  });

  it("keep only the branches a grouped search matched, inside the scope", async () => {
    await inventoryRepository.countAll("t1", ["b1", "b2"], { branchIdsIn: ["b2", "b-outside"] });
    expect(count).toHaveBeenCalledWith({
      where: { tenantId: "t1", AND: [{ branchId: { in: ["b2"] } }] },
    });
  });

  it("return zero without querying when the search matched nothing", async () => {
    await expect(inventoryRepository.countAll("t1", ["b1"], { branchIdsIn: [] })).resolves.toBe(0);
    await expect(inventoryRepository.countByStatus("t1", ["b1"], { modelIdsIn: [] })).resolves.toEqual(
      [],
    );
    expect(count).not.toHaveBeenCalled();
    expect(groupBy).not.toHaveBeenCalled();
  });

  it("narrow by model and by unit search text", async () => {
    await inventoryRepository.countByStatus("t1", ["b1"], { modelIdsIn: ["m1"], q: " sn-9 " });
    const where = groupBy.mock.calls[0][0].where;
    expect(where.statusCode).toBeUndefined();
    expect(where.AND).toEqual([
      { branchId: { in: ["b1"] } },
      { serialNumber: { modelId: { in: ["m1"] } } },
      {
        OR: [
          { serialNumber: { serialNo: { contains: "sn-9", mode: "insensitive" } } },
          { serialNumber: { model: { skuCode: { contains: "sn-9", mode: "insensitive" } } } },
          { serialNumber: { model: { name: { contains: "sn-9", mode: "insensitive" } } } },
          { branch: { name: { contains: "sn-9", mode: "insensitive" } } },
        ],
      },
    ]);
  });
});

describe("inventory series summary narrowing", () => {
  it("skips the query when the model search matched nothing", async () => {
    await expect(
      inventoryRepository.aggregateSeriesBySku("t1", ["b1"], { modelIdsIn: [] }),
    ).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("passes matched models and the search pattern as parameters", async () => {
    await inventoryRepository.aggregateSeriesBySku("t1", ["b1"], {
      modelIdsIn: ["m1"],
      q: "50%",
    });
    // $queryRaw`…WHERE ${conditions}`: the joined conditions are the first interpolated value.
    const conditions = queryRaw.mock.calls[0][1] as { values: unknown[] };
    expect(conditions.values).toEqual(expect.arrayContaining(["m1", "%50\\%%"]));
  });
});
