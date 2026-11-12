import {
  branchInventoryChangeableHint,
  branchInventoryUnitTotal,
  branchSerialLabel,
  branchSerialSelectionBlock,
  branchStatusTargets,
  deriveBranchAttentionQueue,
  projectDisplayUnitMove,
  projectReturnToStockMove,
  type BranchAttentionSource,
} from "@/features/inventory/utils/branch-inventory-v2";

function branch(
  id: string,
  name: string,
  counts: BranchAttentionSource["counts"],
): BranchAttentionSource {
  return {
    branch: { id, name, sapCode: id.toUpperCase() },
    counts,
  };
}

describe("deriveBranchAttentionQueue", () => {
  const north = branch("b-north", "North", {
    defective: 2,
    total: 4,
    statuses: [{ count: 3 }, { count: 2 }],
  });
  const south = branch("b-south", "South", {
    defective: 0,
    total: 1,
    statuses: [{ count: 5 }],
    notStockedIn: 1,
  });
  const east = branch("b-east", "East", { defective: 0, total: 0, statuses: [] });

  it("lists defective branches first, then off-planogram branches, each by name", () => {
    const queue = deriveBranchAttentionQueue({
      branches: [south, north, east],
      offPlanogramBranches: [south, north],
    });

    expect(queue.map((issue) => issue.id)).toEqual([
      "defective:b-north",
      "off-planogram:b-north",
      "off-planogram:b-south",
    ]);
    expect(queue[0]).toMatchObject({ kind: "defective", count: 2, branchName: "North" });
    expect(queue[1]?.count).toBe(5);
    expect(queue[2]?.count).toBe(6);
  });

  it("keeps a branch that is only off the planogram", () => {
    const queue = deriveBranchAttentionQueue({
      branches: [south],
      offPlanogramBranches: [south],
    });
    expect(queue).toHaveLength(1);
    expect(queue[0]?.kind).toBe("off-planogram");
  });

  it("sums status chips and units that are not stocked in", () => {
    expect(
      branchInventoryUnitTotal({
        total: 1,
        notStockedIn: 2,
        statuses: [{ count: 4 }, { count: 1 }],
      }),
    ).toBe(7);
    expect(branchInventoryUnitTotal({ total: 3 })).toBe(3);
  });
});

describe("branch serial selection", () => {
  it("selects in-stock and display units that have a serial and are not waiting", () => {
    expect(
      branchSerialSelectionBlock({
        serialNo: "SN-1",
        statusCode: "STK",
        pendingDefectInspection: false,
      }),
    ).toBeNull();
    expect(
      branchSerialSelectionBlock({
        serialNo: "SN-DU",
        statusCode: "DU",
        pendingDefectInspection: false,
      }),
    ).toBeNull();
    expect(branchSerialLabel("SN-1")).toBe("SN-1");
  });

  it("blocks an empty serial, a pending defect, a defective unit, and other statuses", () => {
    expect(
      branchSerialSelectionBlock({
        serialNo: "  ",
        statusCode: "STK",
        pendingDefectInspection: false,
      }),
    ).toBe("missing-serial");
    expect(branchSerialLabel("  ")).toBe("Not provided");
    expect(
      branchSerialSelectionBlock({
        serialNo: "SN-2",
        statusCode: "STK",
        pendingDefectInspection: true,
      }),
    ).toBe("pending-defect");
    expect(
      branchSerialSelectionBlock({
        serialNo: "SN-DEF",
        statusCode: "DEF",
        pendingDefectInspection: false,
      }),
    ).toBe("defective");
    expect(
      branchSerialSelectionBlock({
        serialNo: "SN-3",
        statusCode: "DIT",
        pendingDefectInspection: false,
      }),
    ).toBe("not-stock");
    expect(
      branchSerialSelectionBlock({
        serialNo: "SN-4",
        statusCode: "SLD",
        pendingDefectInspection: false,
      }),
    ).toBe("not-stock");
    expect(
      branchSerialSelectionBlock({
        serialNo: "SN-5",
        statusCode: "RSV",
        pendingDefectInspection: false,
      }),
    ).toBe("not-stock");
  });

  it("keeps a selection on one current status", () => {
    expect(
      branchSerialSelectionBlock(
        { serialNo: "SN-DU", statusCode: "DU", pendingDefectInspection: false },
        "STK",
      ),
    ).toBe("other-status");
    expect(
      branchSerialSelectionBlock(
        { serialNo: "SN-STK", statusCode: "STK", pendingDefectInspection: false },
        "DU",
      ),
    ).toBe("other-status");
    expect(
      branchSerialSelectionBlock(
        { serialNo: "SN-STK", statusCode: "STK", pendingDefectInspection: false },
        "STK",
      ),
    ).toBeNull();
  });

  it("offers display and defect from stock, and stock and defect from display", () => {
    expect(branchStatusTargets("STK")).toEqual(["DU", "DEF"]);
    expect(branchStatusTargets("DU")).toEqual(["STK", "DEF"]);
  });
});

describe("branchInventoryChangeableHint", () => {
  it("stays quiet when a display unit is in the result", () => {
    expect(
      branchInventoryChangeableHint({
        items: [{ statusCode: "DU" }],
        total: 1,
        selectedStatusCode: "DU",
      }),
    ).toBe(false);
  });

  it("shows when the full result has no in-stock or display unit", () => {
    expect(
      branchInventoryChangeableHint({
        items: [{ statusCode: "DEF" }, { statusCode: "DIT" }],
        total: 2,
      }),
    ).toBe(true);
  });

  it("shows when the filter is a status that cannot change", () => {
    expect(
      branchInventoryChangeableHint({
        items: [{ statusCode: "SLD" }],
        total: 10,
        selectedStatusCode: "SLD",
      }),
    ).toBe(true);
  });

  it("stays quiet on a partial page that may hold a changeable unit later", () => {
    expect(
      branchInventoryChangeableHint({
        items: [{ statusCode: "DEF" }],
        total: 40,
      }),
    ).toBe(false);
  });
});

describe("projectDisplayUnitMove", () => {
  it("moves the selected count from stock to display and leaves defective alone", () => {
    const move = projectDisplayUnitMove(2, [
      { code: "STK", name: "In stock", count: 8 },
      { code: "DU", name: "Display", count: 1 },
      { code: "DEF", name: "Defective", count: 4 },
    ]);
    expect(move.stock).toEqual({ code: "STK", name: "In stock", count: 8, after: 6 });
    expect(move.display).toEqual({ code: "DU", name: "Display", count: 1, after: 3 });
  });
});

describe("projectReturnToStockMove", () => {
  it("moves the selected count from display back to stock", () => {
    const move = projectReturnToStockMove(1, [
      { code: "STK", name: "In stock", count: 8 },
      { code: "DU", name: "Display", count: 2 },
      { code: "DEF", name: "Defective", count: 4 },
    ]);
    expect(move.stock).toEqual({ code: "STK", name: "In stock", count: 8, after: 9 });
    expect(move.display).toEqual({ code: "DU", name: "Display", count: 2, after: 1 });
  });
});
