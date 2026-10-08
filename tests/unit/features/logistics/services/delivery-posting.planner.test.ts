import {
  assertExclusiveClaim,
  planAccept,
  planDispatch,
  planReject,
  type DeliveryPostingView,
  type WarehouseHold,
} from "@/features/logistics/services/delivery-posting.planner";

function delivery(overrides: Partial<DeliveryPostingView> = {}): DeliveryPostingView {
  return {
    id: "del-1",
    branchId: "br-1",
    status: "approved",
    lines: [],
    requirements: [{ modelId: "model-1", quantity: 4 }],
    ...overrides,
  };
}

function hold(serialNumberId: string, warehouseId = "wh-1"): WarehouseHold {
  return {
    serialNumberId,
    modelId: "model-1",
    warehouseId,
    warehouseLocationId: `loc-${warehouseId}`,
  };
}

const four = ["s1", "s2", "s3", "s4"];

describe("planDispatch", () => {
  it("allocates the approved quantity from one warehouse", () => {
    const plan = planDispatch(delivery(), four.map((id) => hold(id)), four);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.moves).toHaveLength(4);
    expect(plan.warehouseId).toBe("wh-1");
  });

  it("rejects a second dispatch of the same delivery", () => {
    const plan = planDispatch(
      delivery({ status: "pending" }),
      four.map((id) => hold(id)),
      four,
    );
    expect(plan).toEqual({ ok: false, error: "This delivery has already been dispatched" });
  });

  it("rejects a short warehouse quantity", () => {
    const plan = planDispatch(delivery(), [hold("s1")], ["s1"]);
    expect(plan.ok).toBe(false);
  });

  it("rejects a serial that is not in the warehouse", () => {
    const plan = planDispatch(
      delivery(),
      [hold("s1"), hold("s2"), hold("s3")],
      four,
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toMatch(/not in that warehouse/);
  });

  it("lets only one of two claims keep a shared serial", () => {
    const shared = [hold("s1"), hold("s2"), hold("s3"), hold("s4")];
    const first = planDispatch(delivery({ id: "a" }), shared, four);
    expect(first.ok).toBe(true);
    const remaining = shared.filter((row) => row.serialNumberId !== "s1");
    const second = planDispatch(delivery({ id: "b" }), remaining, four);
    expect(second.ok).toBe(false);
  });

  it("aborts when a claim does not take every row", () => {
    expect(() => assertExclusiveClaim(3, 4, "serial already allocated")).toThrow(
      "serial already allocated",
    );
    expect(() => assertExclusiveClaim(4, 4, "serial already allocated")).not.toThrow();
  });
});

describe("planAccept", () => {
  const lines = four.map((serialNumberId) => ({
    serialNumberId,
    warehouseLocationFromId: "loc-wh-1",
    branchStatus: "DIT" as const,
  }));

  it("fails when the delivery has no lines", () => {
    const plan = planAccept(delivery({ status: "pending", lines: [] }), null);
    expect(plan).toEqual({ ok: false, error: "Delivery has no serials to accept" });
  });

  it("fails when a serial is not in transit", () => {
    const plan = planAccept(
      delivery({
        status: "pending",
        lines: lines.map((line, index) =>
          index === 0 ? { ...line, branchStatus: "SLD" } : line,
        ),
      }),
      null,
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toMatch(/not in-transit/);
  });

  it("accepts every in-transit serial", () => {
    const plan = planAccept(delivery({ status: "pending", lines }), null);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.nextStatus).toBe("accepted");
    expect(plan.moveSerialIds).toEqual(four);
    expect(plan.movedCount).toBe(4);
  });

  it("keeps the rest in transit on a partial accept", () => {
    const plan = planAccept(delivery({ status: "pending", lines }), ["s1", "s2"]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.nextStatus).toBe("partial");
    expect(plan.moveSerialIds).toEqual(["s1", "s2"]);
  });

  it("does not move serials again when the accept is retried", () => {
    const plan = planAccept(
      delivery({
        status: "accepted",
        lines: lines.map((line) => ({ ...line, branchStatus: "STK" })),
      }),
      null,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.idempotent).toBe(true);
    expect(plan.moveSerialIds).toEqual([]);
    expect(plan.movedCount).toBe(4);
  });
});

describe("planReject", () => {
  it("closes an approved delivery without returning stock", () => {
    const plan = planReject(delivery({ status: "approved" }));
    expect(plan).toEqual({ ok: true, idempotent: false, returns: [] });
  });

  it("returns unaccepted serials to the warehouse they left", () => {
    const plan = planReject(
      delivery({
        status: "pending",
        lines: [
          { serialNumberId: "s1", warehouseLocationFromId: "loc-1", branchStatus: "DIT" },
          { serialNumberId: "s2", warehouseLocationFromId: "loc-1", branchStatus: "STK" },
        ],
      }),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.returns).toEqual([{ serialNumberId: "s1", warehouseLocationId: "loc-1" }]);
  });

  it("is a no-op when the delivery is already rejected", () => {
    const plan = planReject(delivery({ status: "rejected" }));
    expect(plan).toEqual({ ok: true, idempotent: true, returns: [] });
  });
});
