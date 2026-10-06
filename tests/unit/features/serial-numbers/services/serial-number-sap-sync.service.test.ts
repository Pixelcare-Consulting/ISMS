jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/serial-numbers/repositories/serial-number.repository", () => ({
  serialNumberRepository: {
    listSapSyncModelKeys: jest.fn().mockResolvedValue([{ id: "m1", skuCode: "32STV105" }]),
    applySapSyncPage: jest.fn().mockResolvedValue({ created: 2, updated: 0, unchanged: 0, failures: [] }),
  },
}));
jest.mock("@/features/inventory/services/sap-stock-placement.service", () => ({
  sapStockPlacementService: { beginRun: jest.fn() },
}));
// Stand-in engine: prepare once, parse a page, write it — the calls the real engine makes.
jest.mock("@/features/sap/services/sap-sync-engine", () => ({
  runSapSync: jest.fn(async (tenantId, entity) => {
    const context = await entity.prepare(tenantId);
    const rows = [
      { DocEntry: 11, SerialNumber: "SN1", ItemCode: "32STV105" },
      { DocEntry: 12, SerialNumber: "SN2", ItemCode: "32STV105" },
    ];
    const records = rows.map((row) => entity.parse(row, context).record);
    const applied = await entity.applyPage(tenantId, records, context);
    return {
      fetched: 2, created: applied.created, updated: 0, unchanged: 0, removed: 0,
      skipped: applied.failures.map((f: { reason: string }) => ({ reason: f.reason, count: 1, examples: [] })),
      caughtUp: false, passRows: 2, totalAtSource: null,
    };
  }),
}));

import { sapStockPlacementService } from "@/features/inventory/services/sap-stock-placement.service";
import { serialNumberRepository } from "@/features/serial-numbers/repositories/serial-number.repository";
import { serialNumberSapSyncService } from "@/features/serial-numbers/services/serial-number-sap-sync.service";

const beginRun = sapStockPlacementService.beginRun as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it("places each written page and reports the batch's stock", async () => {
  const run = {
    placePage: jest.fn().mockResolvedValue([]),
    finish: jest.fn().mockResolvedValue({ notes: ["Stock from SAP for this batch: 2 added"], skipped: [] }),
  };
  beginRun.mockResolvedValue(run);

  const result = await serialNumberSapSyncService.syncFromSap("t1", "u1");

  expect(run.placePage).toHaveBeenCalledWith([
    { serialNo: "SN1", modelId: "m1", itemCode: "32STV105", docEntry: 11 },
    { serialNo: "SN2", modelId: "m1", itemCode: "32STV105", docEntry: 12 },
  ]);
  expect(result.notes).toEqual(["Stock from SAP for this batch: 2 added"]);
  expect(result.created).toBe(2);
});

it("writes serials with only their own columns — placement fields never reach Prisma", async () => {
  beginRun.mockResolvedValue({ placePage: jest.fn().mockResolvedValue([]), finish: jest.fn().mockResolvedValue({ notes: [], skipped: [] }) });

  await serialNumberSapSyncService.syncFromSap("t1", "u1");

  expect(serialNumberRepository.applySapSyncPage).toHaveBeenCalledWith("t1", [
    { serialNo: "SN1", modelId: "m1" },
    { serialNo: "SN2", modelId: "m1" },
  ]);
});

it("still syncs serials when placement cannot start, and says why", async () => {
  beginRun.mockRejectedValue(new Error("ISMS could not create the SAP saved query"));

  const result = await serialNumberSapSyncService.syncFromSap("t1", "u1");

  expect(result.created).toBe(2);
  expect(result.notes).toEqual([
    "Stock was not placed from SAP: ISMS could not create the SAP saved query",
  ]);
});
