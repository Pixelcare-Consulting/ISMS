import {
  chunkKeysForFilter,
  decodeTargetedResume,
  encodeTargetedResume,
  planSegment,
  segmentClause,
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

/** The client's Service Layer refuses a query string longer than this (measured 2026-10-28). */
const SAP_QUERY_LIMIT = 2048;
/** The longest rest of a segmented query: $select, $orderby and the resume clause. */
const QUERY_OVERHEAD = "$filter= and DocEntry gt 4008123&$select=DocEntry,SerialNumber,ItemCode&$orderby=DocEntry".length;

describe("segments fit the Service Layer's query-string limit", () => {
  const serials = Array.from({ length: 500 }, (_, i) => `55QUHW01L08250${String(i).padStart(4, "0")}`);

  it("plans serial-number segments that SAP accepts", () => {
    const segment = { field: "SerialNumber", kind: "string" as const };
    let anchor: string | null = null;
    let planned = 0;
    for (;;) {
      const plan = planSegment([...serials].sort(), anchor, segment);
      if (!plan) break;
      expect(segmentClause(segment, plan.keys).length + QUERY_OVERHEAD).toBeLessThanOrEqual(SAP_QUERY_LIMIT);
      planned += plan.keys.length;
      if (plan.next === null) break;
      anchor = plan.next;
    }
    expect(planned).toBe(serials.length);
  });

  it("splits a key list for a filtered read the same way", () => {
    const segment = { field: "WarehouseCode", kind: "string" as const };
    const codes = Array.from({ length: 300 }, (_, i) => `FWH${String(i).padStart(5, "0")}`);
    const batches = chunkKeysForFilter(codes, segment);
    expect(batches.flat()).toEqual(codes);
    for (const batch of batches) {
      expect(segmentClause(segment, batch).length + QUERY_OVERHEAD).toBeLessThanOrEqual(SAP_QUERY_LIMIT);
    }
  });
});
