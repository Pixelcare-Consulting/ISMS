import {
  planAccept,
  type DeliveryPostingView,
} from "@/features/logistics/services/delivery-posting.planner";

function delivery(overrides: Partial<DeliveryPostingView> = {}): DeliveryPostingView {
  return {
    id: "del-1",
    branchId: "br-1",
    sourceWarehouseId: "wh-1",
    status: "approved",
    lines: [],
    requirements: [{ modelId: "model-1", quantity: 4 }],
    ...overrides,
  };
}

const four = ["s1", "s2", "s3", "s4"];

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

  it("accept refused while return pending", () => {
    const plan = planAccept(delivery({ status: "pending", lines }), null, { openReturn: true });
    expect(plan).toEqual({
      ok: false,
      error: "A return request for this delivery is waiting for approval",
    });
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
