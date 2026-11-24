import {
  groupRestores,
  planPulloutCancel,
  type PulloutCancelLine,
} from "@/features/logistics/lib/pullout-cancel";
import type { PulloutSapDocument } from "@/features/logistics/lib/pullout-sap-document";

function unit(overrides: Partial<PulloutCancelLine> & { serialNumberId: string }): PulloutCancelLine {
  return {
    serialNo: overrides.serialNumberId.toUpperCase(),
    priorCode: "STK",
    inventoryCode: "DIT",
    linked: null,
    redelivered: false,
    legacySettled: false,
    ...overrides,
  };
}

function doc(overrides: Partial<PulloutSapDocument> = {}): PulloutSapDocument {
  return {
    type: "IT",
    docEntry: 10,
    docNum: 494405,
    docDate: "2026-11-12",
    cancelled: false,
    closed: false,
    lines: [{ pulloutRef: "PLT-1", baseType: null, baseEntry: null, branchCode: "", serialNos: ["S1"] }],
    ...overrides,
  };
}

function plan(status: string, lines: PulloutCancelLine[], documents: PulloutSapDocument[] | null = []) {
  return planPulloutCancel({ pulloutNo: "PLT-1", status, lines, documents });
}

describe("planPulloutCancel before Send", () => {
  it("puts held units back to their prior code and leaves DEF units alone", () => {
    const result = plan(
      "pending_logistics",
      [
        unit({ serialNumberId: "s1", inventoryCode: "FPO" }),
        unit({ serialNumberId: "s2", inventoryCode: "DEF", priorCode: "DEF" }),
        unit({ serialNumberId: "s3", inventoryCode: "RSV", priorCode: "STK" }),
      ],
      null,
    );
    expect(result).toEqual({
      ok: true,
      idempotent: false,
      restores: [
        { serialNumberId: "s1", fromCode: "FPO", restoreCode: "STK" },
        { serialNumberId: "s3", fromCode: "RSV", restoreCode: "STK" },
      ],
      keptPulledOutIds: [],
      sapActions: [],
    });
  });

  it("refuses a unit the pull-out no longer holds", () => {
    const result = plan("for_pullout", [unit({ serialNumberId: "s1", inventoryCode: "SLD" })], null);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("no longer held") });
  });

  it("sends a pull-out waiting for the Team Lead to Reject", () => {
    expect(plan("pending_tl", [unit({ serialNumberId: "s1", inventoryCode: "RSV" })], null)).toEqual({
      ok: false,
      error: expect.stringContaining("Reject it instead"),
    });
  });

  it("is a no-op on a cancelled pull-out", () => {
    expect(plan("cancelled", [], null)).toMatchObject({ ok: true, idempotent: true });
  });
});

describe("planPulloutCancel after Send", () => {
  it("restores units SAP has no document for", () => {
    const result = plan("in_transit", [unit({ serialNumberId: "s1" }), unit({ serialNumberId: "s2", priorCode: "DEF" })]);
    expect(result).toMatchObject({
      ok: true,
      restores: [
        { serialNumberId: "s1", fromCode: "DIT", restoreCode: "STK" },
        { serialNumberId: "s2", fromCode: "DIT", restoreCode: "DEF" },
      ],
      sapActions: [],
    });
  });

  it("cancels a linked IT and restores its units", () => {
    const result = plan(
      "pulled_out",
      [unit({ serialNumberId: "s1", inventoryCode: "PO", linked: { type: "IT", docEntry: 10 } })],
      [doc()],
    );
    expect(result).toMatchObject({
      ok: true,
      restores: [{ serialNumberId: "s1", fromCode: "PO", restoreCode: "STK" }],
      keptPulledOutIds: [],
      sapActions: [{ type: "IT", docEntry: 10, docNum: 494405, action: "Cancel" }],
    });
  });

  it("closes a linked Return once and keeps its units Pulled out", () => {
    const returnDoc = doc({
      type: "RETURN",
      docEntry: 20,
      docNum: 12631,
      lines: [{ pulloutRef: "plt-1 ", baseType: null, baseEntry: null, branchCode: "", serialNos: ["S1", "S2"] }],
    });
    const result = plan(
      "pulled_out",
      [
        unit({ serialNumberId: "s1", inventoryCode: "PO", linked: { type: "RETURN", docEntry: 20 } }),
        unit({ serialNumberId: "s2", inventoryCode: "PO", linked: { type: "RETURN", docEntry: 20 } }),
      ],
      [returnDoc],
    );
    expect(result).toMatchObject({
      ok: true,
      restores: [],
      keptPulledOutIds: ["s1", "s2"],
      sapActions: [{ type: "RETURN", docEntry: 20, action: "Close" }],
    });
  });

  it("skips closing a Return SAP already closed", () => {
    const result = plan(
      "pulled_out",
      [unit({ serialNumberId: "s1", inventoryCode: "PO", linked: { type: "RETURN", docEntry: 20 } })],
      [doc({ type: "RETURN", docEntry: 20, closed: true })],
    );
    expect(result).toMatchObject({ ok: true, keptPulledOutIds: ["s1"], sapActions: [] });
  });

  it("restores units whose linked document SAP already cancelled, with no SAP call", () => {
    const result = plan(
      "pulled_out",
      [unit({ serialNumberId: "s1", inventoryCode: "PO", linked: { type: "IT", docEntry: 10 } })],
      [doc({ cancelled: true })],
    );
    expect(result).toMatchObject({
      ok: true,
      restores: [{ serialNumberId: "s1", fromCode: "PO", restoreCode: "STK" }],
      sapActions: [],
    });
  });

  it("refuses a document that also holds another pull-out's rows", () => {
    const shared = doc({
      lines: [
        { pulloutRef: "PLT-1", baseType: null, baseEntry: null, branchCode: "", serialNos: ["S1"] },
        { pulloutRef: "PLT-2", baseType: null, baseEntry: null, branchCode: "", serialNos: ["S9"] },
      ],
    });
    const result = plan(
      "pulled_out",
      [unit({ serialNumberId: "s1", inventoryCode: "PO", linked: { type: "IT", docEntry: 10 } })],
      [shared],
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining("other pull-outs") });
  });

  it("asks for Check SAP when SAP has a document ISMS has not linked", () => {
    const result = plan("in_transit", [unit({ serialNumberId: "s1" })], [doc()]);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Run Check SAP first") });
  });

  it("refuses once a unit was redelivered", () => {
    const result = plan("pulled_out", [unit({ serialNumberId: "s1", inventoryCode: "DIT", redelivered: true })]);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("redelivered") });
  });

  it("needs the SAP documents after Send", () => {
    expect(plan("in_transit", [unit({ serialNumberId: "s1" })], null)).toEqual({
      ok: false,
      error: expect.stringContaining("SAP must be checked"),
    });
  });
});

describe("groupRestores", () => {
  it("batches by current code and restore code", () => {
    expect(
      groupRestores([
        { serialNumberId: "a", fromCode: "PO", restoreCode: "STK" },
        { serialNumberId: "b", fromCode: "DIT", restoreCode: "STK" },
        { serialNumberId: "c", fromCode: "PO", restoreCode: "STK" },
      ]),
    ).toEqual([
      { fromCode: "PO", restoreCode: "STK", serialNumberIds: ["a", "c"] },
      { fromCode: "DIT", restoreCode: "STK", serialNumberIds: ["b"] },
    ]);
  });
});
