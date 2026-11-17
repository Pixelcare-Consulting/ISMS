import {
  nextScReturnNo,
  planScReturnRequest,
  scDeliveryReceiptLines,
  SC_RETURN_ALREADY_OPEN_ERROR,
} from "@/features/service-center-ops/lib/sc-delivery-return";

const at = (iso: string) => new Date(iso);

const lines = [
  { serialNumberId: "s1", acceptedAt: null, returnedAt: null },
  { serialNumberId: "s2", acceptedAt: at("2026-11-17T05:00:00Z"), returnedAt: null },
  { serialNumberId: "s3", acceptedAt: null, returnedAt: at("2026-11-17T06:00:00Z") },
  { serialNumberId: "s4", acceptedAt: null, returnedAt: null },
];

function plan(overrides: Partial<Parameters<typeof planScReturnRequest>[0]> = {}) {
  return planScReturnRequest({
    status: "pending",
    fromOrder: true,
    lines,
    onOpenReturn: new Set(),
    requestedSerialIds: ["s1"],
    ...overrides,
  });
}

describe("planScReturnRequest", () => {
  it("accepts in-transit units of a pending or partial order delivery", () => {
    expect(plan()).toEqual({ ok: true, serialNumberIds: ["s1"] });
    expect(plan({ status: "partial", requestedSerialIds: ["s1", "s4"] })).toEqual({
      ok: true,
      serialNumberIds: ["s1", "s4"],
    });
  });

  it("refuses pull-out redeliveries and settled deliveries", () => {
    expect(plan({ fromOrder: false }).ok).toBe(false);
    expect(plan({ status: "accepted" }).ok).toBe(false);
    expect(plan({ status: "rejected" }).ok).toBe(false);
  });

  it("refuses received, returned, duplicate, unknown and empty picks", () => {
    expect(plan({ requestedSerialIds: ["s2"] }).ok).toBe(false);
    expect(plan({ requestedSerialIds: ["s3"] }).ok).toBe(false);
    expect(plan({ requestedSerialIds: ["s1", "s1"] }).ok).toBe(false);
    expect(plan({ requestedSerialIds: ["nope"] }).ok).toBe(false);
    expect(plan({ requestedSerialIds: [] }).ok).toBe(false);
  });

  it("refuses units already on an open reject", () => {
    expect(plan({ onOpenReturn: new Set(["s1"]) })).toEqual({ ok: false, error: SC_RETURN_ALREADY_OPEN_ERROR });
  });
});

describe("scDeliveryReceiptLines", () => {
  it("groups units as in transit, pending reject, received and returned", () => {
    const base = { serialNo: "SN", skuCode: "M1", modelName: "Model 1", openReturn: null };
    const result = scDeliveryReceiptLines([
      { ...base, ...lines[0] },
      { ...base, ...lines[1] },
      { ...base, ...lines[2] },
      { ...base, ...lines[3], openReturn: { id: "r1", requestNo: "SCRJ-1" } },
    ]);

    expect(result.map((line) => [line.serialNumberId, line.state, line.inTransit])).toEqual([
      ["s1", "IN_TRANSIT", true],
      ["s2", "RECEIVED", false],
      ["s3", "RETURNED", false],
      ["s4", "PENDING_REJECT", true],
    ]);
    expect(result[3].openReturn).toEqual({ id: "r1", requestNo: "SCRJ-1" });
    expect(result.every((line) => line.openTransfer === null)).toBe(true);
  });
});

describe("nextScReturnNo", () => {
  it("uses the SC reject prefix", () => {
    expect(nextScReturnNo()).toMatch(/^SCRJ-[0-9A-Z]+$/);
  });
});
