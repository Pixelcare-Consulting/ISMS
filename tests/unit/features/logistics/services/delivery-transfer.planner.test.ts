import {
  defaultTransferPlaces,
  isOpenTransferLine,
  isSapPending,
  nextTransferStatus,
  planInTransitCancel,
  planLineDecision,
  planRelease,
  planReleasePlace,
  planTransferCreate,
} from "@/features/logistics/services/delivery-transfer.planner";
import { planDeliverySettle, receiptLineState } from "@/features/logistics/services/delivery-posting.planner";
import {
  DELIVERY_TRANSFER_LINE_STATUS_LABELS,
  DELIVERY_TRANSFER_STATUS_LABELS,
  sapTransferNotPostedMessage,
} from "@/features/logistics/constants/delivery-workflow-labels";

function unit(serialNumberId: string, branchStatus: string | null = "DIT", onOpenTransfer = false) {
  return { serialNumberId, branchStatus, onOpenTransfer };
}

describe("planTransferCreate", () => {
  it("accepts in-transit units on a pending or partial delivery", () => {
    expect(planTransferCreate({ deliveryStatus: "pending", units: [unit("s1")] })).toEqual({ ok: true });
    expect(planTransferCreate({ deliveryStatus: "partial", units: [unit("s1"), unit("s2")] })).toEqual({
      ok: true,
    });
  });

  it("create refuses units not DIT", () => {
    const plan = planTransferCreate({ deliveryStatus: "partial", units: [unit("s1"), unit("s2", "STK")] });
    expect(plan).toEqual({ ok: false, error: "Only units still in transit on this delivery can be transferred" });
    expect(planTransferCreate({ deliveryStatus: "partial", units: [unit("s1", null)] }).ok).toBe(false);
  });

  it("create refuses unit already on an open transfer", () => {
    const plan = planTransferCreate({ deliveryStatus: "pending", units: [unit("s1", "DIT", true)] });
    expect(plan).toEqual({ ok: false, error: "One or more units are already on an open transfer" });
  });

  it("create refused while a return is pending", () => {
    const plan = planTransferCreate({ deliveryStatus: "pending", hasOpenReturn: true, units: [unit("s1")] });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toMatch(/return request/);
  });

  it("refuses a delivery that is not pending or partial", () => {
    for (const status of ["approved", "accepted", "rejected", "requested"]) {
      expect(planTransferCreate({ deliveryStatus: status, units: [unit("s1")] }).ok).toBe(false);
    }
  });

  it("refuses an empty or duplicated selection", () => {
    expect(planTransferCreate({ deliveryStatus: "pending", units: [] }).ok).toBe(false);
    expect(planTransferCreate({ deliveryStatus: "pending", units: [unit("s1"), unit("s1")] }).ok).toBe(false);
  });
});

describe("defaultTransferPlaces", () => {
  it("defaults release to delivery branch and receive to source warehouse location", () => {
    expect(defaultTransferPlaces({ branchId: "b1", sourceWarehouseId: "w1" }, "loc1")).toEqual({
      release: { kind: "BRANCH", branchId: "b1" },
      receive: { kind: "WAREHOUSE", warehouseId: "w1", warehouseLocationId: "loc1" },
    });
  });

  it("leaves receive empty when the delivery has no source warehouse or location", () => {
    expect(defaultTransferPlaces({ branchId: "b1", sourceWarehouseId: null }, "loc1").receive).toBeNull();
    expect(defaultTransferPlaces({ branchId: "b1", sourceWarehouseId: "w1" }, null).receive).toBeNull();
  });
});

describe("planLineDecision", () => {
  it("approve only from PENDING", () => {
    expect(planLineDecision({ status: "PENDING" }, "APPROVE", "PENDING_APPROVAL")).toEqual({
      ok: true,
      next: "APPROVED",
    });
    for (const status of ["APPROVED", "REMOVED", "RECEIVED"] as const) {
      expect(planLineDecision({ status }, "APPROVE", "PENDING_APPROVAL").ok).toBe(false);
    }
    expect(planLineDecision({ status: "PENDING" }, "APPROVE", "IN_TRANSIT").ok).toBe(false);
  });

  it("remove frees the unit", () => {
    const fromPending = planLineDecision({ status: "PENDING" }, "REMOVE", "PENDING_APPROVAL");
    expect(fromPending).toEqual({ ok: true, next: "REMOVED" });
    expect(planLineDecision({ status: "APPROVED" }, "REMOVE", "PENDING_APPROVAL")).toEqual({
      ok: true,
      next: "REMOVED",
    });
    // A removed line no longer holds the unit: it can be accepted or transferred again.
    expect(isOpenTransferLine("REMOVED")).toBe(false);
    expect(isOpenTransferLine("PENDING")).toBe(true);
    expect(isOpenTransferLine("APPROVED")).toBe(true);
    expect(planLineDecision({ status: "REMOVED" }, "REMOVE", "PENDING_APPROVAL").ok).toBe(false);
    expect(planLineDecision({ status: "APPROVED" }, "REMOVE", "IN_TRANSIT").ok).toBe(false);
  });

  it("receive only while IN_TRANSIT", () => {
    expect(planLineDecision({ status: "APPROVED" }, "RECEIVE", "IN_TRANSIT")).toEqual({
      ok: true,
      next: "RECEIVED",
    });
    expect(planLineDecision({ status: "APPROVED" }, "RECEIVE", "PENDING_APPROVAL").ok).toBe(false);
    expect(planLineDecision({ status: "APPROVED" }, "RECEIVE", "COMPLETED").ok).toBe(false);
    expect(planLineDecision({ status: "RECEIVED" }, "RECEIVE", "IN_TRANSIT").ok).toBe(false);
    expect(planLineDecision({ status: "REMOVED" }, "RECEIVE", "IN_TRANSIT").ok).toBe(false);
  });
});

describe("planRelease", () => {
  it("release needs no PENDING lines and ≥1 APPROVED", () => {
    expect(planRelease([{ status: "APPROVED" }, { status: "REMOVED" }])).toEqual({ ok: true });
    expect(planRelease([{ status: "APPROVED" }, { status: "PENDING" }]).ok).toBe(false);
    expect(planRelease([{ status: "REMOVED" }]).ok).toBe(false);
    expect(planRelease([]).ok).toBe(false);
  });
});

describe("nextTransferStatus", () => {
  it("completes when every approved line is received", () => {
    expect(nextTransferStatus("IN_TRANSIT", [{ status: "RECEIVED" }, { status: "REMOVED" }])).toBe("COMPLETED");
    expect(nextTransferStatus("IN_TRANSIT", [{ status: "RECEIVED" }, { status: "APPROVED" }])).toBeNull();
  });

  it("cancels when every line is removed", () => {
    expect(nextTransferStatus("PENDING_APPROVAL", [{ status: "REMOVED" }, { status: "REMOVED" }])).toBe(
      "CANCELLED",
    );
    expect(nextTransferStatus("PENDING_APPROVAL", [{ status: "REMOVED" }, { status: "PENDING" }])).toBeNull();
  });
});

describe("planDeliverySettle", () => {
  it("accepts when no line is still in transit at the branch, else partial once one has left", () => {
    expect(planDeliverySettle({ totalLines: 3, stillInTransit: 0 })).toBe("accepted");
    expect(planDeliverySettle({ totalLines: 3, stillInTransit: 1 })).toBe("partial");
    expect(planDeliverySettle({ totalLines: 3, stillInTransit: 3 })).toBeNull();
    expect(planDeliverySettle({ totalLines: 0, stillInTransit: 0 })).toBeNull();
  });
});

describe("labels", () => {
  it("maps every status to Title Case copy", () => {
    expect(DELIVERY_TRANSFER_STATUS_LABELS).toEqual({
      PENDING_APPROVAL: "Pending approval",
      IN_TRANSIT: "In transit",
      COMPLETED: "Completed",
      CANCELLED: "Cancelled",
    });
    expect(DELIVERY_TRANSFER_LINE_STATUS_LABELS).toEqual({
      PENDING: "Pending",
      APPROVED: "Approved",
      REMOVED: "Removed",
      RECEIVED: "Received",
    });
  });
});

describe("planReleasePlace (R11)", () => {
  it("accepts only the delivery branch", () => {
    expect(planReleasePlace({ kind: "BRANCH", id: "b1" }, "b1")).toEqual({ ok: true });
    const refused = { ok: false, error: "Release is the branch the delivery went to." };
    expect(planReleasePlace({ kind: "BRANCH", id: "b2" }, "b1")).toEqual(refused);
    expect(planReleasePlace({ kind: "WAREHOUSE", id: "b1" }, "b1")).toEqual(refused);
  });
});

describe("planInTransitCancel", () => {
  const approved = [{ status: "APPROVED" as const }, { status: "REMOVED" as const }];

  it("allows a released transfer with no SAP IT and nothing received", () => {
    expect(planInTransitCancel({ status: "IN_TRANSIT", sapDocEntry: null, lines: approved })).toEqual({ ok: true });
  });

  it("refuses a posted, partly received, or unreleased transfer", () => {
    expect(planInTransitCancel({ status: "IN_TRANSIT", sapDocEntry: 31, lines: approved }).ok).toBe(false);
    expect(
      planInTransitCancel({
        status: "IN_TRANSIT",
        sapDocEntry: null,
        lines: [{ status: "APPROVED" }, { status: "RECEIVED" }],
      }).ok,
    ).toBe(false);
    expect(planInTransitCancel({ status: "PENDING_APPROVAL", sapDocEntry: null, lines: approved }).ok).toBe(false);
    expect(planInTransitCancel({ status: "CANCELLED", sapDocEntry: null, lines: approved }).ok).toBe(false);
  });
});

describe("isSapPending", () => {
  it("is true only for a released or completed consignment transfer without an SAP IT", () => {
    expect(isSapPending({ sapDocType: "ITR", status: "IN_TRANSIT", sapDocEntry: null })).toBe(true);
    expect(isSapPending({ sapDocType: "ITR", status: "COMPLETED", sapDocEntry: null })).toBe(true);
    expect(isSapPending({ sapDocType: "ITR", status: "IN_TRANSIT", sapDocEntry: 31 })).toBe(false);
    expect(isSapPending({ sapDocType: "ITR", status: "CANCELLED", sapDocEntry: null })).toBe(false);
    expect(isSapPending({ sapDocType: "ITR", status: "PENDING_APPROVAL", sapDocEntry: null })).toBe(false);
    expect(isSapPending({ sapDocType: "SO", status: "IN_TRANSIT", sapDocEntry: null })).toBe(false);
  });
});

describe("sapTransferNotPostedMessage", () => {
  it("points to the retry on the transfer page", () => {
    expect(sapTransferNotPostedMessage("Serial SN1 not in BR1")).toBe(
      "SAP transfer not posted yet: Serial SN1 not in BR1. Use Retry SAP posting below.",
    );
    expect(sapTransferNotPostedMessage(null)).toBe("SAP transfer not posted yet. Use Retry SAP posting below.");
  });
});

describe("receiptLineState", () => {
  it("groups units as in transit, on transfer, received, or transferred", () => {
    expect(receiptLineState({ branchStatus: "DIT", onOpenTransfer: false, receivedOnTransfer: false })).toBe(
      "IN_TRANSIT",
    );
    expect(receiptLineState({ branchStatus: "DIT", onOpenTransfer: true, receivedOnTransfer: false })).toBe(
      "ON_TRANSFER",
    );
    expect(receiptLineState({ branchStatus: "STK", onOpenTransfer: false, receivedOnTransfer: false })).toBe(
      "RECEIVED",
    );
    expect(receiptLineState({ branchStatus: null, onOpenTransfer: false, receivedOnTransfer: true })).toBe(
      "TRANSFERRED",
    );
    // Not at the branch and never received on a unit transfer (e.g. sold or moved later): still received here.
    expect(receiptLineState({ branchStatus: null, onOpenTransfer: false, receivedOnTransfer: false })).toBe(
      "RECEIVED",
    );
  });
});
