import {
  decodeTargetedResume,
  encodeTargetedResume,
} from "@/features/sap/services/sap-sync-segment";

describe("targeted resume token", () => {
  it("round-trips a position and row count", () => {
    const token = encodeTargetedResume({ position: { anchor: "SN1", lastKey: "120" }, rows: 40 });
    expect(decodeTargetedResume(token, "number")).toEqual({
      position: { anchor: "SN1", lastKey: "120" },
      rows: 40,
    });
  });

  it("restarts rather than splice a non-integer key into a numeric filter", () => {
    const token = JSON.stringify({ a: "SN1", k: "1 or DocEntry gt 0", n: 5 });
    expect(decodeTargetedResume(token, "number")).toEqual({
      position: { anchor: null, lastKey: null },
      rows: 0,
    });
  });

  it("treats a missing or malformed token as a fresh start", () => {
    const fresh = { position: { anchor: null, lastKey: null }, rows: 0 };
    expect(decodeTargetedResume(null, "number")).toEqual(fresh);
    expect(decodeTargetedResume("not json", "number")).toEqual(fresh);
    expect(decodeTargetedResume(JSON.stringify({ n: -3 }), "number")).toEqual(fresh);
  });
});
