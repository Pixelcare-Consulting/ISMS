import {
  branchInventoryUnitTotal,
  branchSerialLabel,
  branchSerialSelectionBlock,
  deriveBranchAttentionQueue,
  projectDisplayUnitMove,
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
  it("selects only in-stock units that have a serial and are not waiting", () => {
    expect(
      branchSerialSelectionBlock({
        serialNo: "SN-1",
        statusCode: "STK",
        pendingDefectInspection: false,
      }),
    ).toBeNull();
    expect(branchSerialLabel("SN-1")).toBe("SN-1");
  });

  it("blocks an empty serial, a pending defect, and any status other than stock", () => {
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
        serialNo: "SN-3",
        statusCode: "DU",
        pendingDefectInspection: false,
      }),
    ).toBe("not-stock");
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
