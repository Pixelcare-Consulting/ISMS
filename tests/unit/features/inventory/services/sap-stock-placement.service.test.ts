jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/lib/shared/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn().mockResolvedValue({ id: "c1" }) },
}));
jest.mock("@/features/sap/services/sap-onhand-stock", () => ({
  ensureSapOnHandQuery: jest.fn().mockResolvedValue(undefined),
  fetchSapSerialLocations: jest.fn(),
}));
jest.mock("@/features/reason-status/repositories/reason-status.repository", () => ({
  reasonStatusRepository: { findCodeId: jest.fn().mockResolvedValue({ id: "stk" }) },
}));
jest.mock("@/features/inventory/repositories/sap-stock-placement.repository", () => ({
  sapStockPlacementRepository: {
    listSapBranches: jest.fn(),
    listSapWarehouses: jest.fn(),
    ensureWarehouseLocation: jest.fn().mockResolvedValue("loc-W1"),
    findSerials: jest.fn(),
    findBranchUnits: jest.fn(),
    createBranchUnits: jest.fn(async (_t: string, rows: unknown[]) => rows.length),
    moveBranchUnits: jest.fn().mockResolvedValue(undefined),
    findWarehouseUnits: jest.fn(),
    createWarehouseUnits: jest.fn(async (_t: string, _l: string, ids: unknown[]) => ids.length),
    moveWarehouseUnits: jest.fn().mockResolvedValue(undefined),
    stampWarehouseUnits: jest.fn().mockResolvedValue(undefined),
    countStockUnits: jest.fn(),
    listPlanogramQty: jest.fn(),
    setPlanogramQty: jest.fn().mockResolvedValue(undefined),
  },
}));

import { sapStockPlacementRepository } from "@/features/inventory/repositories/sap-stock-placement.repository";
import {
  sapStockPlacementService,
  type PlacementSerial,
} from "@/features/inventory/services/sap-stock-placement.service";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { fetchSapSerialLocations } from "@/features/sap/services/sap-onhand-stock";

const repo = sapStockPlacementRepository as jest.Mocked<typeof sapStockPlacementRepository>;
const locate = fetchSapSerialLocations as jest.MockedFunction<typeof fetchSapSerialLocations>;

const page: PlacementSerial[] = [
  { serialNo: "NEW", itemCode: "32STV105", modelId: "m1", docEntry: 101 },
  { serialNo: "STAYS", itemCode: "32STV105", modelId: "m1", docEntry: 102 },
  { serialNo: "MOVED", itemCode: "32STV105", modelId: "m1", docEntry: 103 },
  { serialNo: "SOLD", itemCode: "32STV105", modelId: "m1", docEntry: 104 },
  { serialNo: "W-NEW", itemCode: "32STV105", modelId: "m1", docEntry: 105 },
  { serialNo: "W-STAYS", itemCode: "32STV105", modelId: "m1", docEntry: 106 },
  { serialNo: "W-MOVED", itemCode: "32STV105", modelId: "m1", docEntry: 107 },
];

beforeEach(() => {
  jest.clearAllMocks();
  repo.listSapBranches.mockResolvedValue([
    { id: "bA", code: "ABB001", name: "A" },
    { id: "bB", code: "ABB002", name: "B" },
  ]);
  repo.listSapWarehouses.mockResolvedValue([
    { id: "W1", code: "FWH07CEB", name: "Cebu" },
    { id: "W2", code: "FWH14P1F", name: "Pasig" },
  ]);
  locate.mockResolvedValue([
    { serialNo: "NEW", itemCode: "32STV105", warehouseCode: "ABB001" },
    { serialNo: "STAYS", itemCode: "32STV105", warehouseCode: "ABB001" },
    { serialNo: "MOVED", itemCode: "32STV105", warehouseCode: "ABB001" },
    { serialNo: "W-NEW", itemCode: "32STV105", warehouseCode: "FWH07CEB" },
    { serialNo: "W-STAYS", itemCode: "32STV105", warehouseCode: "FWH07CEB" },
    { serialNo: "W-MOVED", itemCode: "32STV105", warehouseCode: "FWH07CEB" },
    // Same serial number under an item this page does not hold — not ours.
    { serialNo: "SOLD", itemCode: "OTHER-ITEM", warehouseCode: "ABB002" },
  ]);
  repo.findSerials.mockImplementation(
    async (_t, nos) => new Map(nos.map((no) => [no, { id: `s-${no}`, modelId: "m1", deletedAt: null }])),
  );
  repo.findBranchUnits.mockResolvedValue([
    { id: "u-stays", branchId: "bA", serialNumberId: "s-STAYS", statusCodeId: "stk" },
    { id: "u-moved", branchId: "bB", serialNumberId: "s-MOVED", statusCodeId: "stk" },
    { id: "u-sold", branchId: "bB", serialNumberId: "s-SOLD", statusCodeId: "stk" },
  ]);
  repo.findWarehouseUnits.mockResolvedValue([
    { id: "wu-stays", serialNumberId: "s-W-STAYS", warehouseId: "W1" },
    { id: "wu-moved", serialNumberId: "s-W-MOVED", warehouseId: "W2" },
  ]);
  repo.listPlanogramQty.mockResolvedValue([
    { id: "pA", branchId: "bA", modelId: "m1", maxQty: 1 },
    { id: "pB", branchId: "bB", modelId: "m1", maxQty: 3 },
  ]);
  repo.countStockUnits.mockResolvedValue(new Map([["bA:m1", 3], ["bB:m1", 1]]));
});

describe("placement run", () => {
  it("places a page's serials where SAP holds them and reports the rest", async () => {
    const run = await sapStockPlacementService.beginRun("t1", "u1");

    await expect(run.placePage(page)).resolves.toEqual([]);

    expect(locate).toHaveBeenCalledWith({ id: "c1" }, 100, 107);
    // Branch → Stock units
    expect(repo.createBranchUnits).toHaveBeenCalledWith(
      "t1",
      [{ branchId: "bA", serialNumberId: "s-NEW" }],
      "stk",
      "u1",
    );
    expect(repo.moveBranchUnits).toHaveBeenCalledWith("t1", [{ id: "u-moved", branchId: "bA" }], "stk", "u1");
    // Warehouse → Warehouse stock, under the warehouse's own location
    expect(repo.createWarehouseUnits).toHaveBeenCalledWith("t1", "loc-W1", ["s-W-NEW"], expect.any(Date));
    expect(repo.moveWarehouseUnits).toHaveBeenCalledWith("t1", ["wu-moved"], "loc-W1", expect.any(Date));
    expect(repo.stampWarehouseUnits).toHaveBeenCalledWith("t1", ["wu-stays"], expect.any(Date));
    // Planogram qty = Stock units, for the branch × model pairs this page touched
    expect(repo.setPlanogramQty).toHaveBeenCalledWith("t1", [
      { id: "pA", maxQty: 3 },
      { id: "pB", maxQty: 1 },
    ]);

    const outcome = await run.finish();
    expect(outcome.notes).toEqual([
      "Stock from SAP for this batch: 2 added · 2 moved · 2 unchanged · 1 no longer on hand in SAP (left as is)",
      "2 planogram quantities updated",
    ]);
  });

  it("reports a page whose stock could not be placed instead of failing the sync", async () => {
    const run = await sapStockPlacementService.beginRun("t1", "u1");
    locate.mockRejectedValueOnce(new Error("timeout"));

    await expect(run.placePage(page)).resolves.toEqual([
      { reason: "Stock was not placed for some serials: timeout" },
    ]);
    expect(repo.createBranchUnits).not.toHaveBeenCalled();
  });

  it("skips serials ISMS has soft-deleted", async () => {
    repo.findSerials.mockResolvedValue(
      new Map([["NEW", { id: "s-NEW", modelId: "m1", deletedAt: new Date() }]]),
    );
    repo.findBranchUnits.mockResolvedValue([]);
    repo.findWarehouseUnits.mockResolvedValue([]);
    const run = await sapStockPlacementService.beginRun("t1", "u1");

    await run.placePage(page.slice(0, 1));

    expect(repo.createBranchUnits).toHaveBeenCalledWith("t1", [], "stk", "u1");
  });
});

describe("planogram quantity", () => {
  const passDone: SapSyncResult = {
    fetched: 10,
    created: 0,
    updated: 0,
    unchanged: 10,
    removed: 0,
    skipped: [],
    caughtUp: true,
    passRows: 10,
    totalAtSource: 10,
  };

  it("models sync sets every planogram row to its Stock unit count", async () => {
    const result = await sapStockPlacementService.afterModelSync("t1", passDone);
    expect(repo.setPlanogramQty).toHaveBeenCalledWith("t1", [
      { id: "pA", maxQty: 3 },
      { id: "pB", maxQty: 1 },
    ]);
    expect(result.notes).toEqual(["Planogram quantities refreshed from Stock units: 2 changed"]);
    expect(locate).not.toHaveBeenCalled();
  });

  it("does nothing until the models pass completes", async () => {
    const partial = { ...passDone, caughtUp: false };
    await expect(sapStockPlacementService.afterModelSync("t1", partial)).resolves.toBe(partial);
  });

  it("add-model dialog reads one branch's Stock units by model", async () => {
    repo.countStockUnits.mockResolvedValue(new Map([["bA:m1", 3]]));
    await expect(sapStockPlacementService.branchQtyByModel("t1", "bA")).resolves.toEqual(
      new Map([["m1", 3]]),
    );
  });
});
