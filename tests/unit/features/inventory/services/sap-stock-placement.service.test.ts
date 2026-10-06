jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/lib/shared/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn().mockResolvedValue({ id: "c1" }) },
}));
jest.mock("@/features/sap/services/sap-onhand-stock", () => ({
  ...jest.requireActual("@/features/sap/services/sap-onhand-stock"),
  assertSapOnHandQueryInstalled: jest.fn().mockResolvedValue(undefined),
  fetchSapOnHandSerials: jest.fn(),
  fetchSapOnHandPage: jest.fn(),
}));
jest.mock("@/features/reason-status/repositories/reason-status.repository", () => ({
  reasonStatusRepository: { findCodeId: jest.fn().mockResolvedValue({ id: "stk" }) },
}));
jest.mock("@/features/sap/repositories/sap-sync-cursor.repository", () => ({
  sapSyncCursorRepository: {
    get: jest.fn(),
    beginPass: jest.fn(),
    advance: jest.fn().mockResolvedValue(undefined),
    completePass: jest.fn().mockResolvedValue(undefined),
    recordError: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/features/inventory/repositories/sap-stock-placement.repository", () => ({
  sapStockPlacementRepository: {
    listSapBranches: jest.fn(),
    listSapWarehouses: jest.fn(),
    ensureWarehouseLocation: jest.fn().mockResolvedValue("loc-W1"),
    modelIdBySku: jest.fn(),
    findSerials: jest.fn(),
    findBranchUnits: jest.fn(),
    createBranchUnits: jest.fn(async (_t: string, rows: unknown[]) => rows.length),
    moveBranchUnits: jest.fn().mockResolvedValue(undefined),
    listBranchOnHandSerialNos: jest.fn(),
    findWarehouseUnits: jest.fn(),
    createWarehouseUnits: jest.fn(async (_t: string, _l: string, ids: unknown[]) => ids.length),
    moveWarehouseUnits: jest.fn().mockResolvedValue(undefined),
    stampWarehouseUnits: jest.fn().mockResolvedValue(undefined),
    countWarehouseUnitsUnseen: jest.fn().mockResolvedValue(0),
    listPlanogramQty: jest.fn(),
    setPlanogramQty: jest.fn().mockResolvedValue(undefined),
  },
}));

import { sapStockPlacementRepository } from "@/features/inventory/repositories/sap-stock-placement.repository";
import { sapStockPlacementService } from "@/features/inventory/services/sap-stock-placement.service";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { sapSyncCursorRepository } from "@/features/sap/repositories/sap-sync-cursor.repository";
import { fetchSapOnHandPage, fetchSapOnHandSerials } from "@/features/sap/services/sap-onhand-stock";

const repo = sapStockPlacementRepository as jest.Mocked<typeof sapStockPlacementRepository>;
const cursors = sapSyncCursorRepository as jest.Mocked<typeof sapSyncCursorRepository>;
const fetchBranch = fetchSapOnHandSerials as jest.MockedFunction<typeof fetchSapOnHandSerials>;
const fetchPage = fetchSapOnHandPage as jest.MockedFunction<typeof fetchSapOnHandPage>;

const PASS = new Date("2026-10-06T00:00:00Z");
const idleCursor = { passStartedAt: null, lastKey: null } as never;
const openCursor = (lastKey: string | null) => ({ passStartedAt: PASS, lastKey }) as never;

function serial(id: string, modelId = "m1") {
  return { id, modelId, deletedAt: null };
}

beforeEach(() => {
  jest.clearAllMocks();
  cursors.get.mockResolvedValue(idleCursor);
  cursors.beginPass.mockResolvedValue(openCursor(null));
  repo.listSapBranches.mockResolvedValue([
    { id: "bA", code: "ABB001", name: "A" },
    { id: "bB", code: "ABB002", name: "B" },
  ]);
  repo.listSapWarehouses.mockResolvedValue([{ id: "W1", code: "FWH07CEB", name: "Cebu" }]);
  repo.modelIdBySku.mockResolvedValue(new Map([["32STV105", "m1"]]));
  fetchBranch.mockImplementation(async (_c, whs) =>
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
  fetchPage.mockResolvedValue({
    serials: [
      { itemCode: "32STV105", serialNo: "W-NEW" },
      { itemCode: "32STV105", serialNo: "W-STAYS" },
      { itemCode: "32STV105", serialNo: "W-MOVED" },
    ],
    nextSkip: null,
  });
  repo.findSerials.mockImplementation(async (_t, nos) => {
    const all = new Map([
      ["NEW", serial("s-new")],
      ["STAYS", serial("s-stays")],
      ["MOVED", serial("s-moved")],
      ["W-NEW", serial("w-new")],
      ["W-STAYS", serial("w-stays")],
      ["W-MOVED", serial("w-moved")],
    ]);
    return new Map(nos.filter((no) => all.has(no)).map((no) => [no, all.get(no)!]));
  });
  repo.findBranchUnits.mockResolvedValue([
    { id: "u-stays", branchId: "bA", serialNumberId: "s-stays" },
    { id: "u-moved", branchId: "bB", serialNumberId: "s-moved" },
  ]);
  repo.listBranchOnHandSerialNos.mockImplementation(async (_t, branchId) =>
    branchId === "bA" ? ["NEW", "STAYS", "MOVED"] : ["SOLD-IN-SAP"],
  );
  repo.findWarehouseUnits.mockResolvedValue([
    { id: "wu-stays", serialNumberId: "w-stays", warehouseId: "W1" },
    { id: "wu-moved", serialNumberId: "w-moved", warehouseId: "W-OTHER" },
  ]);
  repo.listPlanogramQty.mockImplementation(async (_t, branchId) =>
    branchId === "bA" ? [{ id: "p1", modelId: "m1", maxQty: 1 }] : [{ id: "p2", modelId: "m1", maxQty: 3 }],
  );
});

describe("place", () => {
  it("places branch and warehouse stock and sets planogram qty from SAP", async () => {
    const result = await sapStockPlacementService.place("t1", "u1", 60_000);

    // Branch → Stock units
    expect(repo.createBranchUnits).toHaveBeenCalledWith(
      "t1",
      [{ branchId: "bA", serialNumberId: "s-new" }],
      "stk",
      "u1",
    );
    expect(repo.moveBranchUnits).toHaveBeenCalledWith("t1", [{ id: "u-moved", branchId: "bA" }], "stk", "u1");

    // Warehouse → Warehouse stock, under the warehouse's own location
    expect(repo.createWarehouseUnits).toHaveBeenCalledWith("t1", "loc-W1", ["w-new"], PASS);
    expect(repo.moveWarehouseUnits).toHaveBeenCalledWith("t1", ["wu-moved"], "loc-W1", PASS);
    expect(repo.stampWarehouseUnits).toHaveBeenCalledWith("t1", ["wu-stays"], PASS);

    // Planogram qty = SAP on-hand per branch × model (4 serials of m1 at bA, none at bB)
    expect(repo.setPlanogramQty).toHaveBeenCalledWith("t1", [{ id: "p1", maxQty: 4 }]);
    expect(repo.setPlanogramQty).toHaveBeenCalledWith("t1", [{ id: "p2", maxQty: 0 }]);

    expect(result.caughtUp).toBe(true);
    expect(result).toMatchObject({ created: 2, updated: 2, unchanged: 2, passRows: 3, totalAtSource: 3 });
    expect(result.notes?.[0]).toBe(
      "Branch and warehouse stock placed from SAP: 2 added · 2 moved · 2 unchanged · " +
        "1 no longer on hand in SAP (left as is)",
    );
    expect(result.skipped.map((skip) => skip.reason)).toEqual(
      expect.arrayContaining([
        "Item is not in ISMS — sync Models from SAP first",
        "Serial is not in ISMS yet — it is placed once the serial sync has read it",
      ]),
    );
    expect(cursors.completePass).toHaveBeenCalled();
  });

  it("stops on its budget mid-warehouse and saves the page to resume from", async () => {
    repo.listSapBranches.mockResolvedValue([]);
    fetchPage.mockResolvedValueOnce({ serials: [], nextSkip: 2000 });

    const result = await sapStockPlacementService.place("t1", "u1", 0);

    expect(result.caughtUp).toBe(false);
    expect(cursors.advance).toHaveBeenLastCalledWith(
      "t1",
      "stock-placement",
      JSON.stringify({ loc: "warehouse:FWH07CEB", skip: 2000 }),
      0,
    );
    expect(cursors.completePass).not.toHaveBeenCalled();
  });

  it("resumes a warehouse at its saved page", async () => {
    cursors.get.mockResolvedValue(openCursor(JSON.stringify({ loc: "warehouse:FWH07CEB", skip: 4000 })));

    await sapStockPlacementService.place("t1", "u1", 60_000);

    expect(fetchBranch).not.toHaveBeenCalled();
    expect(fetchPage).toHaveBeenCalledWith({ id: "c1" }, "FWH07CEB", 4000);
  });

  it("skips an unreadable location and carries on", async () => {
    fetchBranch.mockImplementation(async (_c, whs) => {
      if (whs === "ABB001") throw new Error("timeout");
      return [];
    });

    const result = await sapStockPlacementService.place("t1", "u1", 60_000);

    expect(result.caughtUp).toBe(true);
    expect(result.skipped).toContainEqual(
      expect.objectContaining({
        reason: "Could not place stock for this location: timeout",
        examples: ["ABB001"],
      }),
    );
    expect(fetchPage).toHaveBeenCalled();
  });
});

describe("afterModelSync", () => {
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

  it("sets planogram qty for every branch", async () => {
    const result = await sapStockPlacementService.afterModelSync("t1", passDone);
    expect(repo.setPlanogramQty).toHaveBeenCalledWith("t1", [{ id: "p1", maxQty: 4 }]);
    expect(repo.setPlanogramQty).toHaveBeenCalledWith("t1", [{ id: "p2", maxQty: 0 }]);
    expect(result.notes).toEqual(["Planogram quantities refreshed from SAP: 2 changed across 2 branches"]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("does nothing until the models pass completes", async () => {
    const partial = { ...passDone, caughtUp: false };
    await expect(sapStockPlacementService.afterModelSync("t1", partial)).resolves.toBe(partial);
  });
});
