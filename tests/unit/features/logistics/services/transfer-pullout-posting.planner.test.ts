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
  planPulloutReceive,
  planPulloutCreate,
  planPulloutFinalize,
  planPulloutLineApprove,
  planPulloutLineDelete,
  planPulloutReject,
  planPulloutUpdateList,
  pulloutClassificationError,
  pulloutCondition,
  pulloutDestination,
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
    expect(approved.holds).toEqual([]);

    const released = planTransferRelease({
      status: "for_transfer",
      lines: [transferLine({ inventoryCode: "RSV" })],
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.nextStatus).toBe("in_transit");

    const received = planTransferReceive({
      status: "in_transit",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [transferLine({ inventoryCode: "DIT", branchId: "branch-a" })],
      requestedSerialIds: ["s1"],
    });
    expect(received.ok).toBe(true);
    if (!received.ok) return;
    expect(received.nextStatus).toBe("accepted");
    expect(received.moves).toEqual([
      { serialNumberId: "s1", restoreCode: "STK", fromCode: "DIT" },
    ]);
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
      lines: [transferLine({ priorCode: "DEF", inventoryCode: "DIT", branchId: "branch-a" })],
      requestedSerialIds: ["s1"],
    });
    expect(received.ok).toBe(true);
    if (!received.ok) return;
    expect(received.moves).toEqual([
      { serialNumberId: "s1", restoreCode: "STK", fromCode: "DIT" },
    ]);
  });

  it("leaves unconfirmed serials in transit and the header in transit", () => {
    const plan = planTransferReceive({
      status: "in_transit",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [
        transferLine({ serialNumberId: "s1", inventoryCode: "DIT", branchId: "branch-a" }),
        transferLine({ serialNumberId: "s2", inventoryCode: "DIT", branchId: "branch-a" }),
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

  it("accepts a reserved serial before it is released", () => {
    const plan = planTransferReceive({
      status: "for_transfer",
      fromBranchId: "branch-a",
      toBranchId: "branch-b",
      lines: [transferLine({ inventoryCode: "RSV", branchId: "branch-a" })],
      requestedSerialIds: ["s1"],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.moves).toEqual([
      { serialNumberId: "s1", restoreCode: "STK", fromCode: "RSV" },
    ]);
    expect(plan.nextStatus).toBe("accepted");
  });

  it("rejects one serial back to stock and finishes a mixed request as completed", () => {
    const rejected = planTransferSerialReject({
      status: "for_transfer",
      fromBranchId: "branch-a",
      lines: [
        transferLine({ serialNumberId: "s1", inventoryCode: "RSV", branchId: "branch-a" }),
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
      { serialNumberId: "s1", restoreCode: "STK", fromCode: "RSV" },
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
      warehouseId: "wh-1",
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
      warehouseId: "wh-1",
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
      warehouseId: "wh-1",
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

describe("pulloutDestination", () => {
  type Warehouse = { id: string; deletedAt: Date | null };
  const primary: Warehouse = { id: "primary", deletedAt: null };
  const main: Warehouse = { id: "main", deletedAt: null };

  it("uses the branch's primary warehouse", () => {
    expect(pulloutDestination(primary, main)).toBe(primary);
  });

  it("falls back to the main warehouse when the branch has none", () => {
    expect(pulloutDestination(null, main)).toBe(main);
  });

  it("skips a primary warehouse that has been deleted", () => {
    expect(pulloutDestination({ id: "primary", deletedAt: new Date() }, main)).toBe(main);
  });

  it("returns null when neither warehouse is available", () => {
    expect(pulloutDestination(null, null)).toBeNull();
  });
});

describe("pull-out receiving", () => {
  const inTransit = (
    serialNumberId: string,
    overrides: Partial<Parameters<typeof planPulloutReceive>[0]["lines"][number]> = {},
  ) => ({
    serialNumberId,
    priorCode: "STK" as const,
    inventoryCode: "DIT" as const,
    received: false,
    ...overrides,
  });
  const receipt = (serialNumberId: string, warehouseLocationId = "loc-1") => ({
    serialNumberId,
    warehouseLocationId,
  });

  it("keeps each unit's original STK or DEF and its chosen location", () => {
    const plan = planPulloutReceive({
      status: "in_transit",
      lines: [inTransit("s1"), inTransit("s2", { priorCode: "DEF" })],
      receipts: [receipt("s1", "loc-1"), receipt("s2", "loc-2")],
    });

    expect(plan).toEqual({
      ok: true,
      lines: [
        { serialNumberId: "s1", priorCode: "STK", warehouseLocationId: "loc-1" },
        { serialNumberId: "s2", priorCode: "DEF", warehouseLocationId: "loc-2" },
      ],
      completes: true,
    });
  });

  it("stays open while units are still in transit", () => {
    const plan = planPulloutReceive({
      status: "in_transit",
      lines: [inTransit("s1"), inTransit("s2")],
      receipts: [receipt("s1")],
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.completes).toBe(false);
  });

  it("completes when the last unit arrives", () => {
    const plan = planPulloutReceive({
      status: "in_transit",
      lines: [inTransit("s1", { received: true, inventoryCode: null }), inTransit("s2")],
      receipts: [receipt("s2")],
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.completes).toBe(true);
  });

  it.each([
    ["pending_logistics", "Only an in-transit pull-out can be received"],
    ["completed", "Only an in-transit pull-out can be received"],
  ] as const)("refuses a %s pull-out", (status, error) => {
    expect(
      planPulloutReceive({ status, lines: [inTransit("s1")], receipts: [receipt("s1")] }),
    ).toEqual({ ok: false, error });
  });

  it("needs at least one unit", () => {
    expect(
      planPulloutReceive({ status: "in_transit", lines: [inTransit("s1")], receipts: [] }),
    ).toEqual({ ok: false, error: "Select the units that arrived" });
  });

  it("refuses the same unit twice in one receipt", () => {
    expect(
      planPulloutReceive({
        status: "in_transit",
        lines: [inTransit("s1")],
        receipts: [receipt("s1"), receipt("s1")],
      }),
    ).toEqual({ ok: false, error: "Each serial can only be received once" });
  });

  it("refuses a unit that is not on the pull-out", () => {
    expect(
      planPulloutReceive({
        status: "in_transit",
        lines: [inTransit("s1")],
        receipts: [receipt("s9")],
      }),
    ).toEqual({ ok: false, error: "A selected serial is not on this pull-out" });
  });

  it("refuses a unit that was already received", () => {
    expect(
      planPulloutReceive({
        status: "in_transit",
        lines: [inTransit("s1", { received: true, inventoryCode: null }), inTransit("s2")],
        receipts: [receipt("s1")],
      }),
    ).toEqual({ ok: false, error: "A selected unit was already received" });
  });

  it("needs a location for every unit", () => {
    expect(
      planPulloutReceive({
        status: "in_transit",
        lines: [inTransit("s1")],
        receipts: [receipt("s1", "")],
      }),
    ).toEqual({ ok: false, error: "Choose a warehouse location for every unit" });
  });

  it("refuses a unit that is no longer in transit", () => {
    expect(
      planPulloutReceive({
        status: "in_transit",
        lines: [inTransit("s1", { inventoryCode: "STK" })],
        receipts: [receipt("s1")],
      }),
    ).toEqual({ ok: false, error: "Some units are no longer in transit at the branch" });
  });

  it("refuses a unit with no recorded STK or DEF", () => {
    const plan = planPulloutReceive({
      status: "in_transit",
      lines: [inTransit("s1", { priorCode: null })],
      receipts: [receipt("s1")],
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toMatch(/Prior status was not recorded/);
  });

  it("lets a repeated Send pass after some units were received", () => {
    const plan = planPulloutFinalize({
      status: "in_transit",
      lines: [inTransit("s1", { received: true, inventoryCode: null }), inTransit("s2")],
    });

    expect(plan.ok).toBe(true);
  });
});
