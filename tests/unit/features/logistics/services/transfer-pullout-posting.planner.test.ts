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
  planPulloutComplete,
  planPulloutCreate,
  planPulloutFinalize,
  planPulloutReject,
  planPulloutUpdateList,
  pulloutSapMessage,
  type PulloutLineView,
} from "@/features/logistics/services/pullout-posting.planner";
import type { AllocatableSerial } from "@/features/logistics/services/posting-planner-types";
import {
  planTransferApprove,
  planTransferCreate,
  planTransferReceive,
  planTransferReject,
  planTransferRelease,
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
    expect(received.moves).toEqual([{ serialNumberId: "s1", restoreCode: "STK" }]);
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

  it("keeps a defective unit defective after receipt", () => {
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
    expect(received.moves).toEqual([{ serialNumberId: "s1", restoreCode: "DEF" }]);
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
    expect(finalized.createsWarehouseInventory).toBe(false);
    expect(finalized.setsCompleted).toBe(false);
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
    expect(finalized.createsWarehouseInventory).toBe(false);
    expect(finalized.setsCompleted).toBe(false);
  });

  it("refuses warehouse receipt", () => {
    expect(planPulloutComplete().ok).toBe(false);
    expect(planPulloutComplete().error).toMatch(/stay in transit/i);
  });

  it("does not describe a stub SAP job as posted", () => {
    expect(pulloutSapMessage({ status: "pending", stub: false })).toMatch(/not been posted/i);
    expect(pulloutSapMessage({ status: "completed", stub: true })).toMatch(/not been posted/i);
    expect(pulloutSapMessage({ status: "completed", stub: false })).not.toMatch(/not been posted/i);
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
