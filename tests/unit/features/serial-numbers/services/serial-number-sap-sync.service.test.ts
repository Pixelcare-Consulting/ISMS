const mockSapRows: Record<string, unknown>[] = [];

jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/serial-numbers/services/serial-stock-replicate", () => ({
  loadMasterWarehouseAllowList: jest.fn(),
  partitionOnHandByMaster: jest.requireActual(
    "@/features/serial-numbers/services/serial-stock-replicate",
  ).partitionOnHandByMaster,
  replicateOnHandSerialsToStk: jest.fn(),
}));
jest.mock("@/features/serial-numbers/repositories/serial-number.repository", () => ({
  serialNumberRepository: {
    listSapSyncModelKeys: jest.fn(),
    listSapItemCodesFor: jest.fn(),
    listSapWarehouseCodesFor: jest.fn(),
    listSerialNosAtSapWarehouses: jest.fn(),
    applySapSyncPage: jest.fn(),
    setSapOnHandFlags: jest.fn(),
  },
}));
jest.mock("@/features/sap/services/sap-onhand-stock", () => ({
  ensureSapOnHandQuery: jest.fn(),
  fetchSapSerialLocations: jest.fn(),
  fetchSapSerialsInWarehouse: jest.fn(),
}));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn() },
}));
jest.mock("@/features/sap/services/sap-sync-engine", () => ({
  runSapTargetedSync: jest.fn(async () => ({
    fetched: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    skipped: [],
    caughtUp: true,
    passRows: 0,
    totalAtSource: null,
    resume: null,
  })),
  runSapSync: jest.fn(
    async (
      tenantId: string,
      entity: {
        prepare: (id: string) => Promise<Map<string, string>>;
        parse: (
          row: Record<string, unknown>,
          context: Map<string, string>,
        ) => { record: unknown } | { skip: string };
        applyPage: (
          id: string,
          records: unknown[],
        ) => Promise<{
          created: number;
          updated: number;
          unchanged: number;
          failures: { reason: string; example?: string | null }[];
        }>;
      },
    ) => {
      const context = await entity.prepare(tenantId);
      const records: unknown[] = [];
      for (const row of mockSapRows) {
        const parsed = entity.parse(row, context);
        if ("record" in parsed) records.push(parsed.record);
      }
      const applied = records.length
        ? await entity.applyPage(tenantId, records)
        : { created: 0, updated: 0, unchanged: 0, failures: [] };
      // Same grouping as the engine's skip tally: one entry per reason, distinct examples.
      const byReason = new Map<string, { count: number; examples: Set<string> }>();
      for (const failure of applied.failures) {
        const entry = byReason.get(failure.reason) ?? { count: 0, examples: new Set<string>() };
        entry.count += 1;
        if (failure.example) entry.examples.add(failure.example);
        byReason.set(failure.reason, entry);
      }
      return {
        fetched: mockSapRows.length,
        created: applied.created,
        updated: applied.updated,
        unchanged: applied.unchanged,
        removed: 0,
        skipped: [...byReason].map(([reason, entry]) => ({
          reason,
          count: entry.count,
          examples: [...entry.examples],
        })),
        caughtUp: true,
        passRows: mockSapRows.length,
        totalAtSource: null,
      };
    },
  ),
}));

import {
  fetchSapSerialLocations,
  fetchSapSerialsInWarehouse,
  ensureSapOnHandQuery,
} from "@/features/sap/services/sap-onhand-stock";
import { runSapTargetedSync } from "@/features/sap/services/sap-sync-engine";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { serialNumberRepository } from "@/features/serial-numbers/repositories/serial-number.repository";
import {
  loadMasterWarehouseAllowList,
  replicateOnHandSerialsToStk,
} from "@/features/serial-numbers/services/serial-stock-replicate";
import { serialNumberSapSyncService } from "@/features/serial-numbers/services/serial-number-sap-sync.service";

const listModels = serialNumberRepository.listSapSyncModelKeys as jest.Mock;
const applyPage = serialNumberRepository.applySapSyncPage as jest.Mock;
const setFlags = serialNumberRepository.setSapOnHandFlags as jest.Mock;
const fetchLocations = fetchSapSerialLocations as jest.Mock;
const ensureQuery = ensureSapOnHandQuery as jest.Mock;
const getCredentials = sapServiceLayerService.getCredentials as jest.Mock;
const allowList = loadMasterWarehouseAllowList as jest.Mock;
const replicate = replicateOnHandSerialsToStk as jest.Mock;

function useRows(rows: Record<string, unknown>[]) {
  mockSapRows.splice(0, mockSapRows.length, ...rows);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSapRows.splice(0, mockSapRows.length);
  listModels.mockResolvedValue([{ id: "m-live", skuCode: "LIVE" }]);
  applyPage.mockResolvedValue({ created: 1, updated: 0, unchanged: 0, failures: [] });
  setFlags.mockResolvedValue(undefined);
  getCredentials.mockResolvedValue({ id: "c1", companyDb: "DB" });
  ensureQuery.mockResolvedValue(undefined);
  fetchLocations.mockResolvedValue([]);
  // B1 is a live branch/warehouse code; anything else is treated as not on hand.
  allowList.mockResolvedValue(new Set(["B1"]));
  replicate.mockResolvedValue({ created: 0, moved: 0, skipped: 0 });
});

it("does not insert a serial whose model is no longer in Master data", async () => {
  useRows([
    { DocEntry: 11, SerialNumber: "SN-LIVE", ItemCode: "LIVE" },
    { DocEntry: 12, SerialNumber: "SN-GONE", ItemCode: "GONE" },
  ]);
  fetchLocations.mockResolvedValue([
    { serialNo: "SN-GONE", itemCode: "GONE", warehouseCode: "X" },
    { serialNo: "SN-LIVE", itemCode: "LIVE", warehouseCode: "B1" },
  ]);

  await serialNumberSapSyncService.syncFromSap("t1", "u1");

  expect(applyPage).toHaveBeenCalledWith("t1", [
    { serialNo: "SN-LIVE", modelId: "m-live", docEntry: 11 },
  ]);
  expect(setFlags).toHaveBeenCalledWith(
    "t1",
    ["m-live"],
    [{ serialNo: "SN-LIVE", warehouseCode: "B1" }],
    [],
  );
  const flagged = setFlags.mock.calls.flat().join(" ");
  expect(flagged).not.toContain("SN-GONE");
});

it("marks the page on hand and clears serials on that page that are not", async () => {
  applyPage.mockResolvedValue({ created: 2, updated: 0, unchanged: 0, failures: [] });
  useRows([
    { DocEntry: 11, SerialNumber: "SN1", ItemCode: "LIVE" },
    { DocEntry: 12, SerialNumber: "SN2", ItemCode: "LIVE" },
  ]);
  fetchLocations.mockResolvedValue([
    { serialNo: "SN1", itemCode: "LIVE", warehouseCode: "B1" },
  ]);

  const result = await serialNumberSapSyncService.syncFromSap("t1", "u1");

  expect(fetchLocations).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), 10, 12);
  expect(setFlags).toHaveBeenCalledWith(
    "t1",
    ["m-live"],
    [{ serialNo: "SN1", warehouseCode: "B1" }],
    ["SN2"],
  );
  expect(result.created).toBe(2);
  expect(result.notes).toBeUndefined();
});

it("fails the page when SAP serial warehouses cannot be read", async () => {
  useRows([{ DocEntry: 11, SerialNumber: "SN1", ItemCode: "LIVE" }]);
  ensureQuery.mockRejectedValue(new Error("could not create the SAP saved query"));

  await expect(serialNumberSapSyncService.syncFromSap("t1", "u1")).rejects.toThrow(
    /Serial warehouses could not be read from SAP/,
  );
  expect(applyPage).not.toHaveBeenCalled();
  expect(setFlags).not.toHaveBeenCalled();
});

it("holds back new and existing serials whose SAP warehouse is not in ISMS", async () => {
  useRows([
    { DocEntry: 11, SerialNumber: "SN-OK", ItemCode: "LIVE" },
    { DocEntry: 12, SerialNumber: "SN-NEW-WH", ItemCode: "LIVE" },
    { DocEntry: 13, SerialNumber: "SN-SOLD", ItemCode: "LIVE" },
    { DocEntry: 14, SerialNumber: "SN-NEW-WH-2", ItemCode: "LIVE" },
  ]);
  fetchLocations.mockResolvedValue([
    { serialNo: "SN-OK", itemCode: "LIVE", warehouseCode: "B1" },
    { serialNo: "SN-NEW-WH", itemCode: "LIVE", warehouseCode: "WH9" },
    { serialNo: "SN-NEW-WH-2", itemCode: "LIVE", warehouseCode: "WH9" },
  ]);

  const result = await serialNumberSapSyncService.syncFromSap("t1", "u1");

  // Neither created nor updated: the repository never sees them.
  expect(applyPage).toHaveBeenCalledWith("t1", [
    { serialNo: "SN-OK", modelId: "m-live", docEntry: 11 },
    { serialNo: "SN-SOLD", modelId: "m-live", docEntry: 13 },
  ]);
  expect(setFlags).toHaveBeenCalledWith(
    "t1",
    ["m-live"],
    [{ serialNo: "SN-OK", warehouseCode: "B1" }],
    ["SN-SOLD"],
  );
  expect(replicate).toHaveBeenCalledWith("t1", [{ serialNo: "SN-OK", warehouseCode: "B1" }]);
  expect(result.skipped).toEqual([
    expect.objectContaining({ count: 2, examples: ["WH9"] }),
  ]);
  expect(result.notes?.[0]).toMatch(/2 serial numbers are in SAP warehouses that are not in ISMS \(WH9\)/);
});

it("writes nothing when every serial on the page is in a missing warehouse", async () => {
  useRows([{ DocEntry: 11, SerialNumber: "SN1", ItemCode: "LIVE" }]);
  fetchLocations.mockResolvedValue([{ serialNo: "SN1", itemCode: "LIVE", warehouseCode: "WH9" }]);

  const result = await serialNumberSapSyncService.syncFromSap("t1", "u1");

  expect(applyPage).not.toHaveBeenCalled();
  expect(setFlags).not.toHaveBeenCalled();
  expect(replicate).not.toHaveBeenCalled();
  expect(result.created).toBe(0);
});

it("reads on-hand in separate windows when serial ids on a page are far apart", async () => {
  applyPage.mockResolvedValue({ created: 2, updated: 0, unchanged: 0, failures: [] });
  useRows([
    { DocEntry: 11, SerialNumber: "SN1", ItemCode: "LIVE" },
    { DocEntry: 50000, SerialNumber: "SN2", ItemCode: "LIVE" },
  ]);
  fetchLocations.mockResolvedValue([]);

  await serialNumberSapSyncService.syncFromSap("t1", "u1");

  expect(fetchLocations).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), 10, 11);
  expect(fetchLocations).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), 49999, 50000);
  expect(setFlags).toHaveBeenCalledWith("t1", ["m-live"], [], ["SN1", "SN2"]);
});

describe("syncTargetFromSap", () => {
  const runTargeted = runSapTargetedSync as jest.Mock;
  const itemCodesFor = serialNumberRepository.listSapItemCodesFor as jest.Mock;
  const warehouseCodesFor = serialNumberRepository.listSapWarehouseCodesFor as jest.Mock;
  const serialsAt = serialNumberRepository.listSerialNosAtSapWarehouses as jest.Mock;
  const inWarehouse = fetchSapSerialsInWarehouse as jest.Mock;

  function walkedTarget() {
    return runTargeted.mock.calls[0][2] as { field: string; keys: string[]; label: string };
  }

  it("walks pasted serials by SerialNumber and hands the resume token through", async () => {
    await serialNumberSapSyncService.syncTargetFromSap(
      "t1",
      "u1",
      { kind: "SERIAL", values: ["SN2", "SN1"] },
      { resume: "tok" },
    );

    expect(walkedTarget()).toMatchObject({ field: "SerialNumber", keys: ["SN2", "SN1"] });
    expect(walkedTarget().label).toMatch(/^SERIAL:2:SN1,SN2#[0-9a-f]{8}$/);
    expect(runTargeted.mock.calls[0][4]).toEqual({ resume: "tok" });
  });

  it("walks a model's serials by its SAP item code", async () => {
    itemCodesFor.mockResolvedValue(["LIVE"]);

    await serialNumberSapSyncService.syncTargetFromSap("t1", "u1", {
      kind: "MODEL",
      values: ["m-live"],
    });

    expect(itemCodesFor).toHaveBeenCalledWith("t1", { modelIds: ["m-live"] });
    expect(walkedTarget()).toMatchObject({ field: "ItemCode", keys: ["LIVE"] });
  });

  it("takes a warehouse's serials from SAP and from ISMS, only for carried items", async () => {
    warehouseCodesFor.mockResolvedValue(["B1"]);
    serialsAt.mockResolvedValue(["SN-LEFT"]);
    inWarehouse.mockResolvedValue([
      { serialNo: "SN-HERE", itemCode: "LIVE", warehouseCode: "B1" },
      { serialNo: "SN-OTHER", itemCode: "NOT-CARRIED", warehouseCode: "B1" },
    ]);

    await serialNumberSapSyncService.syncTargetFromSap("t1", "u1", {
      kind: "WAREHOUSE",
      values: ["w1"],
    });

    expect(warehouseCodesFor).toHaveBeenCalledWith("t1", { warehouseIds: ["w1"] });
    expect(walkedTarget().field).toBe("SerialNumber");
    expect([...walkedTarget().keys].sort()).toEqual(["SN-HERE", "SN-LEFT"]);
  });

  it("says so instead of syncing when the selection resolves to nothing", async () => {
    itemCodesFor.mockResolvedValue([]);

    await expect(
      serialNumberSapSyncService.syncTargetFromSap("t1", "u1", { kind: "BRAND", values: ["b1"] }),
    ).rejects.toThrow("None of the selected brands are in ISMS Master data");
    expect(runTargeted).not.toHaveBeenCalled();
  });
});
