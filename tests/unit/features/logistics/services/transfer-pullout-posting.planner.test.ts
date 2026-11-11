jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
  signOutServer: jest.fn(),
}));

jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

import { postingPermissionError } from "@/features/logistics/services/logistics-posting-access";
import {
  planPulloutApprove,
  pulloutReasonError,
  planPulloutCreate,
  planPulloutFinalize,
  planPulloutLineApprove,
  planPulloutLineDelete,
  planPulloutReject,
  planPulloutUpdateList,
  pulloutClassificationError,
  pulloutCondition,
  type PulloutDecisionLineView,
  type PulloutLineView,
} from "@/features/logistics/services/pullout-posting.planner";
import type { AllocatableSerial } from "@/features/logistics/services/posting-planner-types";
import {
  headerAfterLineDecisions,
  planTransferApprove,
  planTransferCreate,
  planTransferReceive,
  planTransferReject,
  planTransferRelease,
  planTransferSerialReject,
  type TransferLineView,
} from "@/features/logistics/services/transfer-posting.planner";

function serial(overrides: Partial<AllocatableSerial> = {}): AllocatableSerial {
  return {
    serialNumberId: "s1",
    serialNo: "SN-1",
    modelId: "model-1",
    inventoryCode: "STK",
    pendingDefectInspection: false,
    frozenInStockCount: false,
    openDocumentIds: [],
    ...overrides,
  };
}

function transferLine(overrides: Partial<TransferLineView> = {}): TransferLineView {
  return {
    serialNumberId: "s1",
    priorCode: "STK",
    inventoryCode: "RSV",
    branchId: "branch-a",
    ...overrides,
  };
}

function pulloutLine(overrides: Partial<PulloutLineView> = {}): PulloutLineView {
  return {
    serialNumberId: "s1",
    priorCode: "STK",
    inventoryCode: "RSV",
    ...overrides,
  };
}

function decidedLine(overrides: Partial<PulloutDecisionLineView> = {}): PulloutDecisionLineView {
  return { ...pulloutLine(), decision: "pending", ...overrides };
}

describe("transfer posting planner", () => {
  it("walks a stock unit from branch A to branch B without adding stock on approval", () => {
    const created = planTransferCreate({
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      modelId: "model-1",
      quantity: 1,
      serials: [serial()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.nextStatus).toBe("pending_tl");
    expect(created.holds).toEqual([{ serialNumberId: "s1", priorCode: "STK", nextCode: "RSV" }]);

    const approved = planTransferApprove({
      status: "pending_tl",
      lines: [transferLine()],
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.nextStatus).toBe("for_transfer");
    expect(approved.destinationStockAdded).toBe(false);
    expect(approved.moves).toEqual([{ serialNumberId: "s1", fromCode: "RSV", priorCode: "STK" }]);

    const released = planTransferRelease({
      status: "for_transfer",
      lines: [transferLine({ inventoryCode: "FTR" })],
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.nextStatus).toBe("in_transit");
    expect(released.moves).toEqual([{ serialNumberId: "s1", fromCode: "FTR" }]);

    const received = planTransferReceive({
      status: "in_transit",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [transferLine({ inventoryCode: "DIT", branchId: "branch-b" })],
      requestedSerialIds: ["s1"],
    });
    expect(received.ok).toBe(true);
    if (!received.ok) return;
    expect(received.nextStatus).toBe("accepted");
    expect(received.moves).toEqual([
      { serialNumberId: "s1", restoreCode: "STK", fromCode: "DIT", atBranchId: "branch-b" },
    ]);
  });

  it("moves a legacy unit that was never reserved to For transfer on approval", () => {
    const plan = planTransferApprove({
      status: "pending_tl",
      lines: [transferLine({ priorCode: null, inventoryCode: "DEF" })],
    });
    expect(plan).toMatchObject({
      ok: true,
      moves: [{ serialNumberId: "s1", fromCode: "DEF", priorCode: "DEF" }],
    });
  });

  it("refuses to approve a request whose unit is no longer reserved", () => {
    const plan = planTransferApprove({
      status: "pending_tl",
      lines: [transferLine({ inventoryCode: "SLD" })],
    });
    expect(plan).toEqual({ ok: false, error: "A serial on this transfer is no longer reserved" });
  });

  it("treats a repeated approval as done once every unit is For transfer", () => {
    const plan = planTransferApprove({
      status: "for_transfer",
      lines: [transferLine({ inventoryCode: "FTR" })],
    });
    expect(plan).toMatchObject({ ok: true, idempotent: true, moves: [] });
  });

  it("releases a transfer approved before For transfer existed", () => {
    const plan = planTransferRelease({
      status: "for_transfer",
      lines: [transferLine({ inventoryCode: "RSV" })],
    });
    expect(plan).toMatchObject({ ok: true, moves: [{ serialNumberId: "s1", fromCode: "RSV" }] });
  });

  it("refuses to release a unit that is not approved for transfer", () => {
    const plan = planTransferRelease({
      status: "for_transfer",
      lines: [transferLine({ inventoryCode: "STK" })],
    });
    expect(plan).toEqual({ ok: false, error: "Some serials are not approved for transfer" });
  });

  it("rejects only the serials on this request", () => {
    const plan = planTransferReject({
      status: "pending_tl",
      lines: [transferLine({ serialNumberId: "s1", priorCode: "STK", inventoryCode: "RSV" })],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.nextStatus).toBe("rejected");
    expect(plan.restores).toEqual([{ serialNumberId: "s1", restoreCode: "STK" }]);
  });

  it("refuses a second submit once the serial is reserved or already on a request", () => {
    const reserved = planTransferCreate({
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      modelId: "model-1",
      quantity: 1,
      serials: [serial({ inventoryCode: "RSV" })],
    });
    expect(reserved.ok).toBe(false);

    const racing = planTransferCreate({
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      modelId: "model-1",
      quantity: 1,
      serials: [serial({ openDocumentIds: ["other-transfer"] })],
    });
    expect(racing.ok).toBe(false);
  });

  it("returns an accepted serial to stock even when it was defective before the request", () => {
    const created = planTransferCreate({
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      modelId: "model-1",
      quantity: 1,
      serials: [serial({ inventoryCode: "DEF" })],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.holds[0]?.priorCode).toBe("DEF");
    expect(created.holds[0]?.nextCode).toBe("RSV");

    const received = planTransferReceive({
      status: "in_transit",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [transferLine({ priorCode: "DEF", inventoryCode: "DIT", branchId: "branch-b" })],
      requestedSerialIds: ["s1"],
    });
    expect(received.ok).toBe(true);
    if (!received.ok) return;
    expect(received.moves).toEqual([
      { serialNumberId: "s1", restoreCode: "STK", fromCode: "DIT", atBranchId: "branch-b" },
    ]);
  });

  it("still accepts a serial released before the row moved to the receiving branch", () => {
    const plan = planTransferReceive({
      status: "in_transit",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [transferLine({ inventoryCode: "DIT", branchId: "branch-a" })],
      requestedSerialIds: ["s1"],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.moves).toEqual([
      { serialNumberId: "s1", restoreCode: "STK", fromCode: "DIT", atBranchId: "branch-a" },
    ]);
  });

  it("refuses a serial whose row sits at a branch outside this transfer", () => {
    const plan = planTransferReceive({
      status: "in_transit",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [transferLine({ inventoryCode: "DIT", branchId: "branch-c" })],
      requestedSerialIds: ["s1"],
    });
    expect(plan).toEqual({ ok: false, error: "A selected serial is not in transit on this transfer" });
  });

  it("leaves unconfirmed serials in transit and the header in transit", () => {
    const plan = planTransferReceive({
      status: "in_transit",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [
        transferLine({ serialNumberId: "s1", inventoryCode: "DIT", branchId: "branch-b" }),
        transferLine({ serialNumberId: "s2", inventoryCode: "DIT", branchId: "branch-b" }),
      ],
      requestedSerialIds: ["s1"],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.nextStatus).toBe("in_transit");
    expect(plan.moves.map((move) => move.serialNumberId)).toEqual(["s1"]);
  });

  it("treats a second receipt of the same serial as a no-op", () => {
    const plan = planTransferReceive({
      status: "in_transit",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [
        transferLine({
          serialNumberId: "s1",
          priorCode: "STK",
          inventoryCode: "STK",
          branchId: "branch-b",
        }),
        transferLine({ serialNumberId: "s2", inventoryCode: "DIT", branchId: "branch-a" }),
      ],
      requestedSerialIds: ["s1"],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.idempotent).toBe(true);
    expect(plan.moves).toEqual([]);
    expect(plan.nextStatus).toBe("in_transit");
  });

  it("treats a repeated release as done", () => {
    const plan = planTransferRelease({
      status: "in_transit",
      lines: [transferLine({ inventoryCode: "DIT" })],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.idempotent).toBe(true);
  });

  it.each(["for_transfer", "approved"] as const)(
    "refuses to accept a serial until Logistics releases the transfer (%s)",
    (status) => {
      const plan = planTransferReceive({
        status,
        fromBranchId: "branch-a",
        toBranchId: "branch-b",
        lines: [transferLine({ inventoryCode: "RSV", branchId: "branch-a" })],
        requestedSerialIds: ["s1"],
      });
      expect(plan).toEqual({
        ok: false,
        error: "Accept serials only after Logistics releases this transfer",
      });
    },
  );

  it.each(["for_transfer", "approved"] as const)(
    "refuses to reject a serial until Logistics releases the transfer (%s)",
    (status) => {
      const plan = planTransferSerialReject({
        status,
        fromBranchId: "branch-a",
        toBranchId: "branch-b",
        lines: [transferLine({ inventoryCode: "RSV", branchId: "branch-a" })],
        serialNumberId: "s1",
        remarks: "Damaged carton",
      });
      expect(plan).toEqual({
        ok: false,
        error: "Reject serials only after Logistics releases this transfer",
      });
    },
  );

  it("still settles a reserved serial on a transfer part-decided before release was required", () => {
    const plan = planTransferReceive({
      status: "in_transit",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [transferLine({ inventoryCode: "RSV", branchId: "branch-a" })],
      requestedSerialIds: ["s1"],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.moves).toEqual([
      { serialNumberId: "s1", restoreCode: "STK", fromCode: "RSV", atBranchId: "branch-a" },
    ]);
    expect(plan.nextStatus).toBe("accepted");
  });

  it("rejects one serial back to stock and finishes a mixed request as completed", () => {
    const rejected = planTransferSerialReject({
      status: "in_transit",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [
        transferLine({ serialNumberId: "s1", inventoryCode: "DIT", branchId: "branch-b" }),
        transferLine({
          serialNumberId: "s2",
          decision: "accepted",
          inventoryCode: "STK",
          branchId: "branch-b",
        }),
      ],
      serialNumberId: "s1",
      remarks: "Damaged carton",
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.moves).toEqual([
      { serialNumberId: "s1", restoreCode: "STK", fromCode: "DIT", atBranchId: "branch-b" },
    ]);
    expect(rejected.nextStatus).toBe("completed");
    expect(
      headerAfterLineDecisions([
        { decision: "accepted" },
        { decision: "rejected" },
      ]),
    ).toBe("completed");
  });
});

describe("pull-out posting planner", () => {
  it("moves a stock unit to in transit and does not complete it or create warehouse stock", () => {
    const created = planPulloutCreate({
      branchId: "branch-a",
      serials: [serial()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.lines[0]).toEqual({ serialNumberId: "s1", priorCode: "STK", nextCode: "RSV" });

    const approved = planPulloutApprove({
      status: "pending_tl",
      lines: [pulloutLine()],
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.nextStatus).toBe("for_pullout");
    expect(approved.moves).toEqual([{ serialNumberId: "s1", nextCode: "FPO" }]);

    const listed = planPulloutUpdateList({
      status: "for_pullout",
      kept: [pulloutLine({ inventoryCode: "FPO" })],
      removed: [],
      added: [],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.nextStatus).toBe("pending_logistics");
    expect(listed.holds).toEqual([]);
    expect(listed.restores).toEqual([]);

    const finalized = planPulloutFinalize({
      status: "pending_logistics",
      lines: [pulloutLine({ inventoryCode: "FPO" })],
    });
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;
    expect(finalized.nextStatus).toBe("in_transit");
    expect(finalized.moves).toEqual([{ serialNumberId: "s1", nextCode: "DIT" }]);
  });

  it("restores a rejected reserve and keeps defective units defective until they leave", () => {
    const rejected = planPulloutReject({
      status: "pending_tl",
      lines: [pulloutLine({ priorCode: "STK", inventoryCode: "RSV" })],
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.nextStatus).toBe("cancelled");
    expect(rejected.restores).toEqual([{ serialNumberId: "s1", restoreCode: "STK" }]);

    const created = planPulloutCreate({
      branchId: "branch-a",
      serials: [serial({ inventoryCode: "DEF" })],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.lines[0]?.nextCode).toBe("DEF");

    const approved = planPulloutApprove({
      status: "pending_tl",
      lines: [pulloutLine({ priorCode: "DEF", inventoryCode: "DEF" })],
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.moves).toEqual([]);

    const finalized = planPulloutFinalize({
      status: "pending_logistics",
      lines: [pulloutLine({ priorCode: "DEF", inventoryCode: "DEF" })],
    });
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;
    expect(finalized.nextStatus).toBe("in_transit");
  });

  it("takes stock and defective units on the same pull-out", () => {
    const created = planPulloutCreate({
      branchId: "branch-a",
      serials: [
        serial(),
        serial({ serialNumberId: "s2", serialNo: "SN-DEF", inventoryCode: "DEF" }),
      ],
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.lines).toEqual([
      { serialNumberId: "s1", priorCode: "STK", nextCode: "RSV" },
      { serialNumberId: "s2", priorCode: "DEF", nextCode: "DEF" },
    ]);
  });

  it("lets the logistics step add a unit of the other type", () => {
    const listed = planPulloutUpdateList({
      status: "for_pullout",
      kept: [pulloutLine({ priorCode: "DEF", inventoryCode: "DEF" })],
      removed: [],
      added: [serial({ serialNumberId: "s2", serialNo: "SN-STK", inventoryCode: "STK" })],
    });

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.holds).toEqual([{ serialNumberId: "s2", priorCode: "STK", nextCode: "FPO" }]);
  });

  it("requires classification on stock units and refuses it on defective ones", () => {
    expect(pulloutClassificationError("STK", 1)).toBeNull();
    expect(pulloutClassificationError("DEF", 0)).toBeNull();
    expect(pulloutClassificationError("STK", 0)).toBe("Choose a classification for every STK unit");
    expect(pulloutClassificationError("DEF", 1)).toBe("Defective units have no classification");
  });

  it("names the type from the lines and reports a mixed pull-out", () => {
    expect(pulloutCondition([{ priorCode: "STK" }, { priorCode: "STK" }])).toBe("STK");
    expect(pulloutCondition([{ priorCode: "DEF" }])).toBe("DEF");
    expect(pulloutCondition([{ priorCode: "STK" }, { priorCode: "DEF" }])).toBe("Mixed");
    expect(pulloutCondition([{ priorCode: null }])).toBeNull();
  });

  it("finishes approval only when every unit is approved line by line", () => {
    const first = planPulloutLineApprove({
      status: "pending_tl",
      lines: [
        decidedLine({ serialNumberId: "s1" }),
        decidedLine({ serialNumberId: "s2" }),
      ],
      serialNumberId: "s1",
    });
    expect(first).toEqual({ ok: true, idempotent: false, completesApproval: false });

    const last = planPulloutLineApprove({
      status: "pending_tl",
      lines: [
        decidedLine({ serialNumberId: "s1", decision: "accepted" }),
        decidedLine({ serialNumberId: "s2" }),
      ],
      serialNumberId: "s2",
    });
    expect(last).toEqual({ ok: true, idempotent: false, completesApproval: true });

    const again = planPulloutLineApprove({
      status: "pending_tl",
      lines: [
        decidedLine({ serialNumberId: "s1", decision: "accepted" }),
        decidedLine({ serialNumberId: "s2" }),
      ],
      serialNumberId: "s1",
    });
    expect(again).toEqual({ ok: true, idempotent: true, completesApproval: false });
  });

  it("refuses line approval after the Team Lead step or for a unit not on the pull-out", () => {
    expect(
      planPulloutLineApprove({ status: "for_pullout", lines: [decidedLine()], serialNumberId: "s1" }).ok,
    ).toBe(false);
    expect(
      planPulloutLineApprove({ status: "pending_tl", lines: [decidedLine()], serialNumberId: "nope" }).ok,
    ).toBe(false);
  });

  it("releases a deleted reserved unit back to stock", () => {
    const plan = planPulloutLineDelete({
      status: "pending_tl",
      lines: [
        decidedLine({ serialNumberId: "s1", decision: "accepted" }),
        decidedLine({ serialNumberId: "s2" }),
      ],
      serialNumberId: "s2",
    });
    expect(plan).toEqual({
      ok: true,
      restore: { serialNumberId: "s2", restoreCode: "STK" },
      completesApproval: true,
    });
  });

  it("leaves a deleted defective unit defective with nothing to restore", () => {
    const plan = planPulloutLineDelete({
      status: "pending_tl",
      lines: [
        decidedLine({ serialNumberId: "s1", priorCode: "DEF", inventoryCode: "DEF" }),
        decidedLine({ serialNumberId: "s2", priorCode: "DEF", inventoryCode: "DEF" }),
      ],
      serialNumberId: "s1",
    });
    expect(plan).toEqual({ ok: true, restore: null, completesApproval: false });
  });

  it("refuses deleting the last unit, because Reject cancels the pull-out", () => {
    const plan = planPulloutLineDelete({
      status: "pending_tl",
      lines: [decidedLine()],
      serialNumberId: "s1",
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toMatch(/reject/i);
  });
});

describe("logistics posting permissions", () => {
  it("refuses a viewer and a supply planner who cannot manage logistics", () => {
    expect(postingPermissionError(["logistics.view"], "transfer.create")).toMatch(/permission/i);
    expect(postingPermissionError(["orders.approve"], "transfer.release")).toMatch(/permission/i);
    expect(postingPermissionError(["orders.approve"], "pullout.finalize")).toMatch(/permission/i);
    expect(postingPermissionError(["orders.approve"], "pullout.updateList")).toMatch(/permission/i);
    expect(postingPermissionError(["orders.create"], "transfer.receive")).toBeNull();
    expect(postingPermissionError(["logistics.manage"], "transfer.release")).toBeNull();
    expect(postingPermissionError(["orders.approve"], "transfer.approve")).toBeNull();
  });
});

describe("pull-out send", () => {
  it("ends the pull-out in transit with nothing left to receive", () => {
    const plan = planPulloutFinalize({
      status: "pending_logistics",
      lines: [
        { serialNumberId: "s1", priorCode: "STK", inventoryCode: "FPO" },
        { serialNumberId: "s2", priorCode: "DEF", inventoryCode: "DEF" },
      ],
    });

    expect(plan).toEqual({
      ok: true,
      nextStatus: "in_transit",
      moves: [
        { serialNumberId: "s1", nextCode: "DIT" },
        { serialNumberId: "s2", nextCode: "DIT" },
      ],
      idempotent: false,
    });
  });

  it("lets a repeated Send pass on an older pull-out that had units received", () => {
    const plan = planPulloutFinalize({
      status: "in_transit",
      lines: [
        { serialNumberId: "s1", priorCode: "STK", inventoryCode: null, received: true },
        { serialNumberId: "s2", priorCode: "STK", inventoryCode: "DIT" },
      ],
    });

    expect(plan.ok).toBe(true);
  });
});

describe("pulloutReasonError", () => {
  it("needs a reason on a stock unit and no problem description", () => {
    expect(pulloutReasonError("STK", true, 0)).toBeNull();
    expect(pulloutReasonError("STK", false, 0)).toBe("Choose a reason for every STK unit");
    expect(pulloutReasonError("STK", true, 1)).toBe("Stock units have no problem description");
  });

  it("needs a problem description on a defective unit and no chosen reason", () => {
    expect(pulloutReasonError("DEF", false, 2)).toBeNull();
    expect(pulloutReasonError("DEF", false, 0)).toBe("Choose a problem description for every DEF unit");
    expect(pulloutReasonError("DEF", true, 1)).toBe("Defective units are always pulled out as defective");
  });
});
