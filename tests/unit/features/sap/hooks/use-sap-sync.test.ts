jest.mock("sonner", () => ({ toast: {} }));

import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { mergeSliceResults } from "@/features/sap/hooks/use-sap-sync";

function slice(overrides: Partial<SapSyncResult>): SapSyncResult {
  return {
    fetched: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    skipped: [],
    caughtUp: false,
    passRows: 0,
    totalAtSource: null,
    ...overrides,
  };
}

describe("mergeSliceResults", () => {
  it("adds counts and merges skips by reason across slices", () => {
    const first = mergeSliceResults(
      null,
      slice({
        created: 2,
        passRows: 100,
        skipped: [{ reason: "Warehouse missing", count: 2, examples: ["WH9"] }],
        notes: ["2 serial numbers are in SAP warehouses that are not in ISMS"],
      }),
    );
    const run = mergeSliceResults(
      first,
      slice({
        created: 1,
        updated: 3,
        passRows: 250,
        caughtUp: true,
        skipped: [
          { reason: "Warehouse missing", count: 3, examples: ["WH9", "WH10"] },
          { reason: "Item is not in ISMS yet", count: 1, examples: ["ITEM1"] },
        ],
      }),
    );

    expect(run).toMatchObject({ created: 3, updated: 3, passRows: 250, caughtUp: true });
    expect(run.skipped).toEqual([
      { reason: "Warehouse missing", count: 5, examples: ["WH9", "WH10"] },
      { reason: "Item is not in ISMS yet", count: 1, examples: ["ITEM1"] },
    ]);
    expect(run.notes).toBeUndefined();
  });

  it("does not mutate the earlier slice", () => {
    const first = mergeSliceResults(
      null,
      slice({ skipped: [{ reason: "R", count: 1, examples: ["A"] }] }),
    );
    mergeSliceResults(first, slice({ skipped: [{ reason: "R", count: 1, examples: ["B"] }] }));
    expect(first.skipped).toEqual([{ reason: "R", count: 1, examples: ["A"] }]);
  });
});
