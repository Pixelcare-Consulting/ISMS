jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/lib/shared/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn() },
}));
jest.mock("@/features/sap/services/sap-change-fetch", () => ({
  ...jest.requireActual("@/features/sap/services/sap-change-fetch"),
  sapReadAll: jest.fn(),
  sapMaxKey: jest.fn(),
}));
jest.mock("@/features/sap/services/sap-change-notifier", () => ({
  notifySapChanges: jest.fn().mockResolvedValue("published"),
}));
jest.mock("@/features/sap/repositories/sap-change-watch.repository", () => ({
  sapChangeWatchRepository: {
    get: jest.fn(),
    recordCheck: jest.fn(),
    recordError: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/features/sap/repositories/sap-change-check.repository", () => ({
  sapChangeCheckRepository: {
    listSyncCursors: jest.fn(),
    listWarehouses: jest.fn(),
    listBranches: jest.fn(),
    listServiceCenters: jest.fn(),
    findModels: jest.fn(),
    listBrands: jest.fn(),
    listModelSkus: jest.fn(),
    findLiveSerials: jest.fn(),
  },
}));

import { sapChangeCheckRepository } from "@/features/sap/repositories/sap-change-check.repository";
import { sapChangeWatchRepository } from "@/features/sap/repositories/sap-change-watch.repository";
import { runSapChangeCheck } from "@/features/sap/services/sap-change-check";
import { sapMaxKey, sapReadAll, type SapWalk } from "@/features/sap/services/sap-change-fetch";
import { notifySapChanges } from "@/features/sap/services/sap-change-notifier";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";

const repo = sapChangeCheckRepository as jest.Mocked<typeof sapChangeCheckRepository>;
const watches = sapChangeWatchRepository as jest.Mocked<typeof sapChangeWatchRepository>;
const readAll = sapReadAll as jest.MockedFunction<typeof sapReadAll>;
const notify = notifySapChanges as jest.MockedFunction<typeof notifySapChanges>;

type Rows = Record<string, unknown>[];
let sap: { warehouses: Rows; branches: Rows; profitCenters: Rows; items: Rows; serials: Rows };

function watch(syncKey: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `w-${syncKey}`,
    tenantId: "t1",
    syncKey,
    fingerprint: null,
    notificationId: null,
    highKey: null,
    pendingKeys: null,
    checkedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** The change set the check handed the notifier for one sync. */
function changesFor(syncKey: string) {
  return notify.mock.calls.find(([input]) => input.target.syncKey === syncKey)?.[0].changes;
}

function resultFor(results: Awaited<ReturnType<typeof runSapChangeCheck>>, syncKey: string) {
  return results.find((result) => result.syncKey === syncKey);
}

beforeEach(() => {
  sap = { warehouses: [], branches: [], profitCenters: [], items: [], serials: [] };

  (sapServiceLayerService.getCredentials as jest.Mock).mockResolvedValue({ baseUrl: "x" });
  readAll.mockImplementation(async (_creds, walk: SapWalk) => {
    const rows =
      walk.entity === "Warehouses"
        ? walk.filter?.includes("'Branch'")
          ? sap.branches
          : sap.warehouses
        : walk.entity === "ProfitCenters"
          ? sap.profitCenters
          : walk.entity === "Items"
            ? sap.items
            : sap.serials;
    return { rows, complete: true };
  });
  watches.get.mockImplementation(async (_tenantId, syncKey) => watch(syncKey));

  repo.listSyncCursors.mockResolvedValue([]);
  repo.listWarehouses.mockResolvedValue([]);
  repo.listBranches.mockResolvedValue([]);
  repo.listServiceCenters.mockResolvedValue([]);
  repo.findModels.mockResolvedValue([]);
  repo.listBrands.mockResolvedValue([]);
  repo.listModelSkus.mockResolvedValue(new Set());
  repo.findLiveSerials.mockResolvedValue(new Set());
});

describe("runSapChangeCheck — location syncs", () => {
  it("parses SAP rows with the sync's own descriptor and reports new ones", async () => {
    sap.warehouses = [{ WarehouseCode: "W9", WarehouseName: "New WH", Inactive: "tNO" }];
    sap.branches = [{ WarehouseCode: "BR1", WarehouseName: "Makati", Inactive: "tNO" }];
    sap.profitCenters = [{ CenterCode: "SC1", CenterName: "North SC" }];

    await runSapChangeCheck("t1");

    expect(changesFor("warehouse")?.created).toEqual(["W9"]);
    expect(changesFor("branch-from-warehouse")?.created).toEqual(["BR1"]);
    expect(changesFor("service-center")?.created).toEqual(["SC1"]);
  });

  it("only counts branches this sync owns as removed", async () => {
    sap.branches = [{ WarehouseCode: "BR1", WarehouseName: "Makati", Inactive: "tNO" }];
    repo.listBranches.mockResolvedValue([
      { sapCode: "BR1", name: "Makati", deletedAt: null, sapSyncSource: "branch-from-warehouse" },
      { sapCode: "BR2", name: "Gone", deletedAt: null, sapSyncSource: "branch-from-warehouse" },
      { sapCode: "BR3", name: "Manual", deletedAt: null, sapSyncSource: null },
      { sapCode: "OB1", name: "OBRA", deletedAt: null, sapSyncSource: "branch" },
    ]);

    await runSapChangeCheck("t1");

    expect(changesFor("branch-from-warehouse")?.removed.sort()).toEqual(["BR2", "BR3"]);
  });

  it("skips a sync that is mid-pass, and checks the rest", async () => {
    repo.listSyncCursors.mockResolvedValue([
      { entity: "warehouse", passStartedAt: new Date(), lastRunAt: new Date(), lastCompletedAt: null },
    ]);

    const results = await runSapChangeCheck("t1");

    expect(resultFor(results, "warehouse")).toEqual({
      syncKey: "warehouse",
      outcome: "skipped",
      detail: "Sync in progress",
    });
    expect(changesFor("warehouse")).toBeUndefined();
    expect(changesFor("service-center")).toBeDefined();
  });

  it("does not wait on a pass abandoned long ago", async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    repo.listSyncCursors.mockResolvedValue([
      { entity: "warehouse", passStartedAt: old, lastRunAt: old, lastCompletedAt: null },
    ]);

    await runSapChangeCheck("t1");

    expect(changesFor("warehouse")).toBeDefined();
  });

  it("records a failing check and carries on with the others", async () => {
    readAll.mockImplementationOnce(async () => {
      throw new Error("SAP returned 500");
    });

    const results = await runSapChangeCheck("t1");

    expect(resultFor(results, "branch-from-warehouse")).toMatchObject({ outcome: "failed" });
    expect(watches.recordError).toHaveBeenCalledWith("t1", "branch-from-warehouse", "SAP returned 500");
    expect(changesFor("warehouse")).toBeDefined();
  });

  it("refuses to run without a SAP connection", async () => {
    (sapServiceLayerService.getCredentials as jest.Mock).mockResolvedValue(null);
    await expect(runSapChangeCheck("t1")).rejects.toThrow();
  });
});

describe("runSapChangeCheck — models", () => {
  it("skips models that have never been synced", async () => {
    const results = await runSapChangeCheck("t1");
    expect(resultFor(results, "product-model")).toMatchObject({ outcome: "skipped" });
  });

  it("reads an UpdateDate window from a day before the last sync, without the brand filter", async () => {
    repo.listSyncCursors.mockResolvedValue([
      {
        entity: "product-model",
        passStartedAt: null,
        lastRunAt: null,
        lastCompletedAt: new Date("2026-10-03T08:00:00Z"),
      },
    ]);
    sap.items = [
      { ItemCode: "TV1", ItemName: "55in TV", Valid: "tYES", Frozen: "tNO", U_Brand: "Samsung" },
      { ItemCode: "TV2", ItemName: "Old TV", Valid: "tYES", Frozen: "tNO", U_Brand: null },
    ];
    repo.findModels.mockResolvedValue([
      {
        skuCode: "TV2",
        name: "Old TV",
        description: "Old TV",
        status: "active",
        brandId: "b1",
        deletedAt: null,
      },
    ]);

    await runSapChangeCheck("t1");

    const itemsWalk = readAll.mock.calls.find(([, walk]) => walk.entity === "Items")?.[1];
    expect(itemsWalk?.filter).toBe("UpdateDate ge '2026-10-02'");
    expect(changesFor("product-model")).toMatchObject({ created: ["TV1"], removed: ["TV2"] });
  });
});

describe("runSapChangeCheck — serial numbers", () => {
  it("records a baseline on the first run and reports nothing", async () => {
    (sapMaxKey as jest.Mock).mockResolvedValue("500");

    const results = await runSapChangeCheck("t1");

    expect(resultFor(results, "serial-number")).toMatchObject({ outcome: "skipped" });
    expect(watches.recordCheck).toHaveBeenCalledWith("t1", "serial-number", {
      highKey: "500",
      pendingKeys: [],
    });
  });

  it("reports new serials for models ISMS holds, not for unknown items, and advances", async () => {
    watches.get.mockImplementation(async (_tenantId, syncKey) =>
      syncKey === "serial-number"
        ? watch(syncKey, { highKey: "500", pendingKeys: ["OLD-1", "OLD-2"] })
        : watch(syncKey),
    );
    sap.serials = [
      { DocEntry: 501, SerialNumber: "SN-A", ItemCode: "TV1" },
      { DocEntry: 502, SerialNumber: "SN-B", ItemCode: "NOT-IN-ISMS" },
    ];
    repo.listModelSkus.mockResolvedValue(new Set(["TV1"]));
    // OLD-1 was synced since the last check.
    repo.findLiveSerials.mockResolvedValue(new Set(["OLD-1"]));

    await runSapChangeCheck("t1");

    const serialWalk = readAll.mock.calls.find(([, walk]) => walk.entity === "SerialNumberDetails")?.[1];
    expect(serialWalk?.filter).toBe("DocEntry gt 500");
    expect(changesFor("serial-number")?.created).toEqual(["OLD-2", "SN-A"]);
    expect(watches.recordCheck).toHaveBeenCalledWith("t1", "serial-number", {
      highKey: "502",
      pendingKeys: ["OLD-2", "SN-A"],
    });
  });

  it("is checked even while a serial sync pass is open", async () => {
    repo.listSyncCursors.mockResolvedValue([
      { entity: "serial-number", passStartedAt: new Date(), lastRunAt: new Date(), lastCompletedAt: null },
    ]);
    (sapMaxKey as jest.Mock).mockResolvedValue("1");

    const results = await runSapChangeCheck("t1");

    expect(resultFor(results, "serial-number")?.detail).toBe("Baseline recorded");
  });
});
