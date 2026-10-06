jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/lib/shared/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn().mockResolvedValue({ id: "c1" }) },
}));
jest.mock("@/features/sap/services/sap-branch-stock", () => ({
  assertSapOnHandQueryInstalled: jest.fn().mockResolvedValue(undefined),
  fetchSapOnHandSerials: jest.fn(),
}));
jest.mock("@/features/reason-status/repositories/reason-status.repository", () => ({
  reasonStatusRepository: { findCodeId: jest.fn().mockResolvedValue({ id: "stk" }) },
}));
jest.mock("@/features/inventory/repositories/sap-branch-stock.repository", () => ({
  sapBranchStockRepository: {
    listSapBranches: jest.fn(),
    modelIdBySku: jest.fn(),
    replaceStockLevels: jest.fn().mockResolvedValue(undefined),
    findSerials: jest.fn(),
    findStockUnits: jest.fn(),
    createStockUnits: jest.fn(async (_t: string, rows: unknown[]) => rows.length),
    moveStockUnits: jest.fn().mockResolvedValue(undefined),
    listOnHandStockUnits: jest.fn(),
  },
}));

import { sapBranchStockRepository } from "@/features/inventory/repositories/sap-branch-stock.repository";
import { sapBranchStockService } from "@/features/inventory/services/sap-branch-stock.service";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { fetchSapOnHandSerials } from "@/features/sap/services/sap-branch-stock";

const repo = sapBranchStockRepository as jest.Mocked<typeof sapBranchStockRepository>;
const fetchOnHand = fetchSapOnHandSerials as jest.MockedFunction<typeof fetchSapOnHandSerials>;

const passDone: SapSyncResult = {
  fetched: 10,
  created: 0,
  updated: 0,
  unchanged: 10,
  removed: 0,
  skipped: [],
  caughtUp: true,
  passRows: 10,
  totalAtSource: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  repo.listSapBranches.mockResolvedValue([
    { id: "bA", sapCode: "ABB001" },
    { id: "bB", sapCode: "ABB002" },
  ]);
  repo.modelIdBySku.mockResolvedValue(new Map([["32STV105", "m1"]]));
  fetchOnHand.mockImplementation(async (_creds, whs) =>
    whs === "ABB001"
      ? [
          { itemCode: "32STV105", serialNo: "NEW" },
          { itemCode: "32STV105", serialNo: "STAYS" },
          { itemCode: "32STV105", serialNo: "MOVED" },
          { itemCode: "32STV105", serialNo: "UNKNOWN" },
          { itemCode: "NOT-IN-ISMS", serialNo: "X1" },
        ]
      : [],
  );
  repo.findSerials.mockResolvedValue(
    new Map([
      ["NEW", { id: "s-new", modelId: "m1", deletedAt: null }],
      ["STAYS", { id: "s-stays", modelId: "m1", deletedAt: null }],
      ["MOVED", { id: "s-moved", modelId: "m1", deletedAt: null }],
    ]),
  );
  repo.findStockUnits.mockResolvedValue([
    { id: "u-stays", branchId: "bA", serialNumberId: "s-stays" },
    { id: "u-moved", branchId: "bB", serialNumberId: "s-moved" },
  ]);
  repo.listOnHandStockUnits.mockResolvedValue([
    { branchId: "bA", serialNumber: { serialNo: "NEW" } },
    { branchId: "bA", serialNumber: { serialNo: "STAYS" } },
    { branchId: "bA", serialNumber: { serialNo: "MOVED" } },
    { branchId: "bB", serialNumber: { serialNo: "SOLD-IN-SAP" } },
  ]);
});

describe("afterSerialSync", () => {
  it("creates, moves and leaves Stock units per SAP's branch, reporting the rest", async () => {
    const result = await sapBranchStockService.afterSerialSync("t1", "u1", passDone);

    expect(repo.createStockUnits).toHaveBeenCalledWith(
      "t1",
      [{ branchId: "bA", serialNumberId: "s-new" }],
      "stk",
      "u1",
    );
    expect(repo.moveStockUnits).toHaveBeenCalledWith(
      "t1",
      [{ id: "u-moved", branchId: "bA" }],
      "stk",
      "u1",
    );
    expect(result.notes).toEqual([
      "Stock units from SAP: 1 added · 1 moved · 1 unchanged · 1 no longer on hand in SAP (left as is)",
    ]);
    const reasons = result.skipped.map((skip) => skip.reason);
    expect(reasons).toEqual(
      expect.arrayContaining([
        "Item is not in ISMS — sync Models from SAP first",
        "Serial is not in ISMS yet — it is placed once the serial sync has read it",
      ]),
    );
  });

  it("refreshes planogram on-hand per branch, empty branches included", async () => {
    await sapBranchStockService.afterSerialSync("t1", "u1", passDone);

    expect(repo.replaceStockLevels).toHaveBeenCalledWith(
      "t1",
      "bA",
      [{ modelId: "m1", onHandQty: 4 }],
      expect.any(Date),
    );
    expect(repo.replaceStockLevels).toHaveBeenCalledWith("t1", "bB", [], expect.any(Date));
  });

  it("does nothing until the serial pass has completed", async () => {
    const partial = { ...passDone, caughtUp: false };
    await expect(sapBranchStockService.afterSerialSync("t1", "u1", partial)).resolves.toBe(partial);
    expect(fetchOnHand).not.toHaveBeenCalled();
  });

  it("leaves an unreadable branch untouched and reports it", async () => {
    fetchOnHand.mockImplementation(async (_creds, whs) => {
      if (whs === "ABB002") throw new Error("timeout");
      return [];
    });
    repo.findSerials.mockResolvedValue(new Map());
    repo.findStockUnits.mockResolvedValue([]);
    repo.listOnHandStockUnits.mockResolvedValue([]);

    const result = await sapBranchStockService.afterSerialSync("t1", "u1", passDone);

    expect(repo.replaceStockLevels).toHaveBeenCalledTimes(1);
    expect(repo.replaceStockLevels).toHaveBeenCalledWith("t1", "bA", [], expect.any(Date));
    expect(result.skipped).toEqual([
      expect.objectContaining({
        reason: "Could not read this branch's stock from SAP: timeout",
        examples: ["ABB002"],
      }),
    ]);
  });

  it("reports a failure on the result instead of failing the completed sync", async () => {
    repo.listSapBranches.mockRejectedValue(new Error("db down"));
    const result = await sapBranchStockService.afterSerialSync("t1", "u1", passDone);
    expect(result.notes).toEqual(["Stock units were not updated: db down"]);
    expect(result.caughtUp).toBe(true);
  });
});
