jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));
jest.mock("@/features/sap/repositories/sap-sync-cursor.repository", () => ({
  sapSyncCursorRepository: {
    get: jest.fn(),
    beginPass: jest.fn(),
    advance: jest.fn(),
    completePass: jest.fn(),
    recordError: jest.fn(),
  },
}));
jest.mock("@/features/sap/services/sap-service-layer-client", () => ({
  sapServiceLayerClient: { request: jest.fn() },
}));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn() },
}));

import { sapSyncCursorRepository } from "@/features/sap/repositories/sap-sync-cursor.repository";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { runSapTargetedSync } from "@/features/sap/services/sap-sync-engine";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";

const request = sapServiceLayerClient.request as jest.Mock;
const cursor = sapSyncCursorRepository as unknown as Record<string, jest.Mock>;
const passStartedAt = new Date("2026-10-27T00:00:00Z");

function page(rows: Record<string, unknown>[]) {
  return { statusCode: 200, data: { value: rows }, rawBody: "", headers: {} };
}

function entity() {
  return {
    key: "serial-number",
    noun: { one: "serial number", many: "serial numbers" },
    entity: "SerialNumberDetails",
    select: "DocEntry,SerialNumber,ItemCode",
    keyField: "DocEntry",
    keyKind: "number",
    audit: { action: "serial_number.sap_sync", entityType: "SerialNumber" },
    parse: (row: Record<string, unknown>) => ({ record: row.SerialNumber }),
    applyPage: jest.fn(async (_t: string, records: unknown[]) => ({
      created: records.length,
      updated: 0,
      unchanged: 0,
      failures: [],
    })),
    reconcile: { markSeen: jest.fn(), retireUnseen: jest.fn() },
  } satisfies SapSyncEntity;
}

beforeEach(() => {
  jest.clearAllMocks();
  (sapServiceLayerService.getCredentials as jest.Mock).mockResolvedValue({ id: "c1" });
  cursor.get.mockResolvedValue({ passStartedAt, passRows: 0, lastKey: null });
});

it("writes the target's rows without touching the pass cursor or retiring anything", async () => {
  request
    .mockResolvedValueOnce(page([{ DocEntry: 5, SerialNumber: "SN1", ItemCode: "A" }]))
    .mockResolvedValueOnce(page([]));
  const sync = entity();

  const result = await runSapTargetedSync(
    "t1",
    sync,
    { field: "SerialNumber", kind: "string", keys: ["SN1"], label: "SERIAL:1" },
    "u1",
  );

  expect(decodeURIComponent(request.mock.calls[0][0].path)).toContain("(SerialNumber eq 'SN1')");
  expect(sync.applyPage).toHaveBeenCalledWith("t1", ["SN1"], undefined);
  // Stamped with the running pass's mark, so that pass does not treat SN1 as unseen.
  expect(sync.reconcile.markSeen).toHaveBeenCalledWith("t1", ["SN1"], passStartedAt);
  expect(sync.reconcile.retireUnseen).not.toHaveBeenCalled();
  expect(cursor.advance).not.toHaveBeenCalled();
  expect(cursor.beginPass).not.toHaveBeenCalled();
  expect(cursor.completePass).not.toHaveBeenCalled();
  expect(result).toMatchObject({ created: 1, caughtUp: true, passRows: 1, resume: null });
});

it("continues from a resume token the previous slice handed back", async () => {
  request.mockResolvedValueOnce(page([]));
  const target = { field: "SerialNumber", kind: "string" as const, keys: ["SN1"], label: "S" };
  const token = JSON.stringify({ a: "SN1", k: "9", n: 1 });

  const result = await runSapTargetedSync("t1", entity(), target, "u1", { resume: token });

  expect(decodeURIComponent(request.mock.calls[0][0].path)).toContain("DocEntry gt 9");
  expect(result).toMatchObject({ caughtUp: true, passRows: 1, resume: null });
});

it("stops on its budget with a token naming where it got to", async () => {
  let now = 1_000;
  const clock = jest.spyOn(Date, "now").mockImplementation(() => (now += 10));
  request.mockResolvedValueOnce(page([{ DocEntry: 9, SerialNumber: "SN1" }]));
  const target = { field: "SerialNumber", kind: "string" as const, keys: ["SN1"], label: "S" };

  const result = await runSapTargetedSync("t1", entity(), target, "u1", { budgetMs: 5 });
  clock.mockRestore();

  expect(result.caughtUp).toBe(false);
  expect(JSON.parse(result.resume ?? "null")).toEqual({ a: "SN1", k: "9", n: 1 });
  expect(cursor.advance).not.toHaveBeenCalled();
});
