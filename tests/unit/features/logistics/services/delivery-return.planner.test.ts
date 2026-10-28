import type { DeliveryPostingView } from "@/features/logistics/services/delivery-posting.planner";
import {
  planReturnCancel,
  planReturnDecision,
  planReturnRequest,
  planReturnSapReady,
  planReturnSettle,
} from "@/features/logistics/services/delivery-return.planner";
import {
  DELIVERY_RETURN_STATUS_LABELS,
  isReturnOpen,
  needsSapRetry,
  returnSapPendingMessage,
} from "@/features/logistics/constants/delivery-workflow-labels";

function delivery(overrides: Partial<DeliveryPostingView> = {}): DeliveryPostingView {
  return {
    id: "del-1",
    branchId: "br-1",
    sourceWarehouseId: "wh-1",
    status: "partial",
    lines: [
      { serialNumberId: "s1", warehouseLocationFromId: "loc-1", branchStatus: "STK" },
      { serialNumberId: "s2", warehouseLocationFromId: "loc-1", branchStatus: "DIT" },
      { serialNumberId: "s3", warehouseLocationFromId: "loc-2", branchStatus: "DIT" },
    ],
    requirements: [{ modelId: "m1", quantity: 3 }],
    ...overrides,
  };
}

describe("planReturnRequest", () => {
  it("plans only DIT lines", () => {
    const plan = planReturnRequest(delivery(), new Set());
    expect(plan).toEqual({
      ok: true,
      lines: [
        { serialNumberId: "s2", warehouseLocationToId: "loc-1" },
        { serialNumberId: "s3", warehouseLocationToId: "loc-2" },
      ],
    });
  });

  it("a unit on an open reject request cannot be rejected again; the others can", () => {
    const held = new Set(["s2"]);
    expect(planReturnRequest(delivery(), held, new Set(), ["s2"])).toEqual({
      ok: false,
      error: "Some units are already waiting on a reject request",
    });
    expect(planReturnRequest(delivery(), held, new Set(), ["s3"])).toEqual({
      ok: true,
      lines: [{ serialNumberId: "s3", warehouseLocationToId: "loc-2" }],
    });
  });

  it("reject everything skips units already on a request, and refuses when none are left", () => {
    expect(planReturnRequest(delivery(), new Set(["s2"]))).toEqual({
      ok: true,
      lines: [{ serialNumberId: "s3", warehouseLocationToId: "loc-2" }],
    });
    expect(planReturnRequest(delivery(), new Set(["s2", "s3"])).ok).toBe(false);
  });

  it("returns a unit dispatched from SAP's placement with no location to go back to", () => {
    const d = delivery();
    d.lines[2] = { ...d.lines[2], warehouseLocationFromId: null };
    const plan = planReturnRequest(d, new Set());
    expect(plan.ok).toBe(true);
    expect(plan.ok && plan.lines.find((line) => line.serialNumberId === d.lines[2].serialNumberId)).toEqual({
      serialNumberId: d.lines[2].serialNumberId,
      warehouseLocationToId: null,
    });
  });

  it("refuses while a DIT unit is on an open unit transfer", () => {
    expect(planReturnRequest(delivery(), new Set(), new Set(["s3"]))).toEqual({
      ok: false,
      error: "Finish or remove the open unit transfer first.",
    });
  });

  it("refuses a delivery that is not dispatched or already settled", () => {
    for (const status of ["approved", "accepted", "rejected", "requested"] as const) {
      const plan = planReturnRequest(delivery({ status }), new Set());
      expect(plan.ok).toBe(false);
    }
  });

  it("returns only the ticked units", () => {
    const plan = planReturnRequest(delivery(), new Set(), new Set(), ["s3"]);
    expect(plan).toEqual({ ok: true, lines: [{ serialNumberId: "s3", warehouseLocationToId: "loc-2" }] });
  });

  it("a ticked unit on an open transfer blocks; an unticked one does not", () => {
    expect(planReturnRequest(delivery(), new Set(), new Set(["s3"]), ["s3"]).ok).toBe(false);
    expect(planReturnRequest(delivery(), new Set(), new Set(["s3"]), ["s2"]).ok).toBe(true);
  });

  it("refuses ticked units that are not in transit, duplicates, or none", () => {
    expect(planReturnRequest(delivery(), new Set(), new Set(), ["s1"])).toEqual({
      ok: false,
      error: "Some units are not in transit on this delivery",
    });
    expect(planReturnRequest(delivery(), new Set(), new Set(), ["s2", "s2"]).ok).toBe(false);
    expect(planReturnRequest(delivery(), new Set(), new Set(), [])).toEqual({ ok: false, error: "Tick the units to return" });
  });

  it("refuses when nothing is in transit", () => {
    const d = delivery({
      lines: [{ serialNumberId: "s1", warehouseLocationFromId: "loc-1", branchStatus: "STK" }],
    });
    expect(planReturnRequest(d, new Set())).toEqual({ ok: false, error: "No units are in transit on this delivery" });
  });
});

describe("planReturnDecision", () => {
  it("approve only from PENDING_APPROVAL", () => {
    expect(planReturnDecision("PENDING_APPROVAL", "APPROVE")).toEqual({ ok: true, next: "APPROVED" });
    for (const status of ["APPROVED", "COMPLETED", "CANCELLED"] as const) {
      expect(planReturnDecision(status, "APPROVE")).toEqual({
        ok: false,
        error: "This return request has already been decided",
      });
    }
  });

  it("reject gives CANCELLED", () => {
    expect(planReturnDecision("PENDING_APPROVAL", "REJECT")).toEqual({ ok: true, next: "CANCELLED" });
    expect(planReturnDecision("APPROVED", "REJECT").ok).toBe(false);
  });
});

describe("planReturnSettle (R8b)", () => {
  it("every unit went back on a return: rejected", () => {
    for (const status of ["pending", "partial"]) {
      expect(planReturnSettle({ status, stillInTransit: 0, allReturned: true })).toBe("rejected");
    }
  });

  it("nothing left in transit and some units reached stock: accepted", () => {
    expect(planReturnSettle({ status: "partial", stillInTransit: 0, allReturned: false })).toBe("accepted");
  });

  it("units still in transit keep the delivery open as partial", () => {
    for (const status of ["pending", "partial"]) {
      expect(planReturnSettle({ status, stillInTransit: 2, allReturned: false })).toBe("partial");
    }
  });

  it("no other status can be settled by a return", () => {
    for (const status of ["approved", "accepted", "rejected", "requested"]) {
      expect(planReturnSettle({ status, stillInTransit: 0, allReturned: true })).toBeNull();
    }
  });
});

describe("DELIVERY_RETURN_STATUS_LABELS", () => {
  it("labels every status in plain words", () => {
    expect(DELIVERY_RETURN_STATUS_LABELS).toEqual({
      PENDING_APPROVAL: "Pending approval",
      APPROVED: "Approved",
      COMPLETED: "Completed",
      CANCELLED: "Cancelled",
    });
  });
});

describe("return SAP retry visibility", () => {
  it("offers a retry for any APPROVED return, with or without a recorded error", () => {
    expect(needsSapRetry({ status: "APPROVED", sapError: null })).toBe(true);
    expect(needsSapRetry({ status: "APPROVED", sapError: "SAP down" })).toBe(true);
    for (const status of ["PENDING_APPROVAL", "COMPLETED", "CANCELLED"] as const) {
      expect(needsSapRetry({ status, sapError: "x" })).toBe(false);
    }
    expect(needsSapRetry(undefined)).toBe(false);
  });

  it("explains the SAP state of an approved return", () => {
    expect(returnSapPendingMessage("SAP down")).toBe("SAP posting failed: SAP down");
    expect(returnSapPendingMessage(null)).toBe("SAP posting has not finished yet.");
  });

  it("treats pending approval and approved as open", () => {
    expect(isReturnOpen({ status: "PENDING_APPROVAL" })).toBe(true);
    expect(isReturnOpen({ status: "APPROVED" })).toBe(true);
    expect(isReturnOpen({ status: "COMPLETED" })).toBe(false);
    expect(isReturnOpen(null)).toBe(false);
  });
});

describe("planReturnSapReady", () => {
  it("refuses an order with no stored SAP type", () => {
    expect(planReturnSapReady({ orderSapDocType: null, sapDocEntry: 9 })).toEqual({
      ok: false,
      error: "This delivery was dispatched before SAP posting was enabled. Accept or transfer its units instead.",
    });
  });

  it("refuses an outright delivery without its DR, allows consignment without one", () => {
    expect(planReturnSapReady({ orderSapDocType: "SO", sapDocEntry: null })).toEqual({
      ok: false,
      error: "This delivery has no DR in SAP. Accept or transfer its units instead.",
    });
    expect(planReturnSapReady({ orderSapDocType: "SO", sapDocEntry: 9 })).toEqual({ ok: true });
    expect(planReturnSapReady({ orderSapDocType: "ITR", sapDocEntry: null })).toEqual({ ok: true });
  });
});

describe("planReturnCancel", () => {
  it("allows an approved return with no SAP document and a note", () => {
    expect(planReturnCancel({ status: "APPROVED", sapDocEntry: null }, "voided")).toEqual({ ok: true });
  });

  it("refuses other statuses, a posted return, or an empty note", () => {
    expect(planReturnCancel({ status: "PENDING_APPROVAL", sapDocEntry: null }, "x").ok).toBe(false);
    expect(planReturnCancel({ status: "COMPLETED", sapDocEntry: 1 }, "x").ok).toBe(false);
    expect(planReturnCancel({ status: "APPROVED", sapDocEntry: 1 }, "x")).toEqual({
      ok: false,
      error: "SAP already has this return. It cannot be cancelled.",
    });
    expect(planReturnCancel({ status: "APPROVED", sapDocEntry: null }, "")).toEqual({
      ok: false,
      error: "Enter the reason for cancelling the return",
    });
  });
});
