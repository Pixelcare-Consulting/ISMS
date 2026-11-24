import {
  UNIT_HISTORY_LIMIT,
  buildUnitHistoryEvents,
  type UnitHistorySnapshot,
} from "@/features/inventory/lib/unit-history-events";

function emptySnapshot(overrides: Partial<UnitHistorySnapshot> = {}): UnitHistorySnapshot {
  return {
    placement: null,
    statusChanges: [],
    deliveries: [],
    transfers: [],
    deliveryTransfers: [],
    pullouts: [],
    sales: [],
    returns: [],
    deliveryReturns: [],
    stockCounts: [],
    ...overrides,
  };
}

describe("buildUnitHistoryEvents", () => {
  it("puts a Supply Planning approval above a delivery-in-transit placement", () => {
    const events = buildUnitHistoryEvents(
      emptySnapshot({
        placement: {
          id: "inv-1",
          at: new Date("2026-11-02T00:00:00.000Z"),
          statusName: "Delivery in transit",
          actor: { name: "Luis Cruz", email: "luis@example.com", roleSlugs: [] },
        },
        transfers: [
          {
            id: "line-1",
            requestedAt: new Date("2026-11-01T00:00:00.000Z"),
            requestedBy: { name: "Pat Santos", email: "pat@example.com", roleSlugs: ["tl"] },
            approvals: [
              {
                approvedAt: new Date("2026-11-01T04:00:00.000Z"),
                approvedBy: { name: "Ana Reyes", email: "ana@example.com", roleSlugs: ["spa", "tl"] },
                rejectedAt: null,
                rejectedBy: null,
              },
            ],
            decision: "pending",
            decidedAt: null,
            decidedBy: null,
          },
        ],
      }),
    );

    expect(events.map((event) => event.label)).toEqual([
      "Transfer requested",
      "Transfer approved by Supply Planning",
      "Delivery in transit",
    ]);
    expect(events[1]).toMatchObject({ actor: "Ana Reyes" });
    expect(events[2]).toMatchObject({ actor: "Luis Cruz" });
    expect(events.some((event) => event.label === "In stock")).toBe(false);
  });

  it("keeps about 40 events, with the oldest of that set first", () => {
    const statusChanges = Array.from({ length: UNIT_HISTORY_LIMIT + 5 }, (_, index) => ({
      id: `status-${index}`,
      at: new Date(Date.UTC(2026, 0, index + 1)),
      details: `Change ${index}`,
      status: "STK",
      actor: null,
    }));

    const events = buildUnitHistoryEvents(emptySnapshot({ statusChanges }));

    expect(events).toHaveLength(UNIT_HISTORY_LIMIT);
    expect(events[0]?.label).toBe("Change 5");
    expect(events.at(-1)?.label).toBe(`Change ${UNIT_HISTORY_LIMIT + 4}`);
  });
});
