import {
  formatPulloutSapDoc,
  parsePulloutSapDocument,
  parseSapRedelivery,
  planPulloutLinks,
  planPulloutRedeliveries,
  pulloutRefLiteral,
  type PulloutCheckLine,
  type PulloutSapDocument,
  type SapDocLine,
  type SapRedelivery,
} from "@/features/logistics/lib/pullout-sap-document";

function docLine(overrides: Partial<SapDocLine> = {}): SapDocLine {
  return { pulloutRef: "PLT-1", baseType: null, baseEntry: null, branchCode: "", serialNos: [], ...overrides };
}

function doc(overrides: Partial<PulloutSapDocument> = {}): PulloutSapDocument {
  return {
    type: "IT",
    docEntry: 10,
    docNum: 494405,
    docDate: "2026-11-12",
    cancelled: false,
    lines: [docLine({ serialNos: ["SN-1", "SN-2"] })],
    ...overrides,
  };
}

function unit(overrides: Partial<PulloutCheckLine> & { serialNumberId: string }): PulloutCheckLine {
  return {
    serialNo: overrides.serialNumberId.toUpperCase().replace("S", "SN-"),
    inventoryCode: "DIT",
    linked: null,
    redelivered: false,
    legacySettled: false,
    ...overrides,
  };
}

function dr(overrides: Partial<SapRedelivery> = {}): SapRedelivery {
  return {
    docEntry: 900,
    docNum: 168206,
    displayNo: "168206",
    docDate: "2026-11-13",
    cancelled: false,
    lines: [],
    ...overrides,
  };
}

describe("parsing SAP documents", () => {
  it("reads an IT's rows: pull-out UDF, branch and serials", () => {
    const parsed = parsePulloutSapDocument("IT", {
      DocEntry: 10,
      DocNum: 494405,
      DocDate: "2026-11-12T00:00:00Z",
      StockTransferLines: [
        {
          U_ISMS_Pullout_Number: " PLT-1 ",
          BaseType: -1,
          SerialNumbers: [{ InternalSerialNumber: "SN-1" }, { InternalSerialNumber: "SN-1" }],
        },
      ],
    });

    expect(parsed).toEqual({
      type: "IT",
      docEntry: 10,
      docNum: 494405,
      docDate: "2026-11-12",
      cancelled: false,
      lines: [{ pulloutRef: "PLT-1", baseType: -1, baseEntry: null, branchCode: "", serialNos: ["SN-1"] }],
    });
  });

  it("flags a cancelled Return and refuses a document without numbers", () => {
    const cancelled = parsePulloutSapDocument("RETURN", { DocEntry: 1, DocNum: 2, Cancelled: "tYES" });
    expect(cancelled).toMatchObject({ cancelled: true, lines: [] });
    expect(parsePulloutSapDocument("IT", { DocNum: 2 })).toEqual({ error: "SAP document has no DocEntry/DocNum" });
  });

  it("reads a DR's base link and shows its DR number when SAP has one", () => {
    const parsed = parseSapRedelivery({
      DocEntry: 900,
      DocNum: 168206,
      U_DR_NUMBER: "DR-77",
      DocumentLines: [{ BaseType: 16, BaseEntry: 12668, CostingCode2: "B001", SerialNumbers: [] }],
    });
    expect(parsed).toMatchObject({
      displayNo: "DR-77",
      lines: [{ baseType: 16, baseEntry: 12668, branchCode: "B001", pulloutRef: "" }],
    });
  });

  it("quotes the pull-out number for an OData filter", () => {
    expect(pulloutRefLiteral(" PLT-'1 ")).toBe("'PLT-''1'");
    expect(formatPulloutSapDoc("RETURN", 14402)).toBe("Return: 14402");
  });
});

describe("planPulloutLinks", () => {
  it("links units on rows naming this pull-out and pulls out the DIT ones", () => {
    const it = doc();
    const plan = planPulloutLinks({
      pulloutNo: "plt-1",
      lines: [unit({ serialNumberId: "s1" }), unit({ serialNumberId: "s2" }), unit({ serialNumberId: "s3" })],
      documents: [it],
    });

    expect(plan.links).toEqual([{ doc: it, serialNumberIds: ["s1", "s2"] }]);
    expect(plan.pullOutIds).toEqual(["s1", "s2"]);
    expect(plan.waitingSerialNos).toEqual(["SN-3"]);
  });

  it("ignores rows of the same document that belong to another pull-out", () => {
    const shared = doc({
      lines: [docLine({ serialNos: ["SN-1"] }), docLine({ pulloutRef: "PLT-2", serialNos: ["SN-2"] })],
    });
    const plan = planPulloutLinks({
      pulloutNo: "PLT-1",
      lines: [unit({ serialNumberId: "s1" }), unit({ serialNumberId: "s2" })],
      documents: [shared],
    });
    expect(plan.links[0].serialNumberIds).toEqual(["s1"]);
    expect(plan.waitingSerialNos).toEqual(["SN-2"]);
  });

  it("uses the earliest live document and leaves cancelled ones out", () => {
    const later = doc({ docEntry: 20, docDate: "2026-11-13" });
    const earlier = doc({ type: "RETURN", docEntry: 30, docDate: "2026-11-11" });
    const cancelled = doc({ docEntry: 5, docDate: "2026-11-01", cancelled: true });
    const plan = planPulloutLinks({
      pulloutNo: "PLT-1",
      lines: [unit({ serialNumberId: "s1" })],
      documents: [later, cancelled, earlier],
    });
    expect(plan.links).toEqual([{ doc: earlier, serialNumberIds: ["s1"] }]);
    expect(plan.cancelledDocs).toEqual([cancelled]);
  });

  it("keeps a hand-made link and still pulls the unit out; skips settled and redelivered units", () => {
    const plan = planPulloutLinks({
      pulloutNo: "PLT-1",
      lines: [
        unit({ serialNumberId: "s1", linked: { type: "RETURN", docEntry: 7 } }),
        unit({ serialNumberId: "s2", legacySettled: true }),
        unit({ serialNumberId: "s3", inventoryCode: null, redelivered: true }),
        unit({ serialNumberId: "s4", inventoryCode: "PO", linked: { type: "IT", docEntry: 8 } }),
      ],
      documents: [doc()],
    });
    expect(plan.links).toEqual([]);
    expect(plan.pullOutIds).toEqual(["s1"]);
    expect(plan.waitingSerialNos).toEqual([]);
  });
});

describe("planPulloutRedeliveries", () => {
  const base = {
    pulloutNo: "PLT-1",
    pulloutBranchId: "b1",
    pulledOut: [
      { serialNumberId: "s1", serialNo: "SN-1" },
      { serialNumberId: "s2", serialNo: "SN-2" },
    ],
    returnDocEntries: [12668],
    branchIdBySapCode: new Map([["B002", "b2"]]),
  };

  it("follows a DR copied from the pull-out's Return to the pull-out's branch when it names none", () => {
    const copied = dr({ lines: [docLine({ pulloutRef: "", baseType: 16, baseEntry: 12668, serialNos: ["sn-1"] })] });
    const plan = planPulloutRedeliveries({ ...base, redeliveries: [copied] });
    expect(plan).toEqual({ deliveries: [{ dr: copied, branchId: "b1", serialNumberIds: ["s1"] }], skipped: [] });
  });

  it("follows a DR carrying the pull-out number to the branch it names", () => {
    const tagged = dr({ lines: [docLine({ branchCode: "B002", serialNos: ["SN-2"] })] });
    expect(planPulloutRedeliveries({ ...base, redeliveries: [tagged] }).deliveries).toEqual([
      { dr: tagged, branchId: "b2", serialNumberIds: ["s2"] },
    ]);
  });

  it("ignores unrelated lines, units that are not pulled out, and cancelled DRs", () => {
    const unrelated = dr({
      lines: [
        docLine({ pulloutRef: "", baseType: 16, baseEntry: 999, serialNos: ["SN-1"] }),
        docLine({ serialNos: ["SN-9"] }),
      ],
    });
    const cancelled = dr({ docEntry: 901, cancelled: true, lines: [docLine({ serialNos: ["SN-1"] })] });
    expect(planPulloutRedeliveries({ ...base, redeliveries: [unrelated, cancelled] })).toEqual({
      deliveries: [],
      skipped: [],
    });
  });

  it("skips a DR whose branch is not in ISMS or that splits units across branches", () => {
    const unknown = dr({ lines: [docLine({ branchCode: "ZZZ", serialNos: ["SN-1"] })] });
    const split = dr({
      docEntry: 902,
      displayNo: "902",
      lines: [docLine({ branchCode: "B002", serialNos: ["SN-1"] }), docLine({ serialNos: ["SN-2"] })],
    });
    const plan = planPulloutRedeliveries({ ...base, redeliveries: [unknown, split] });
    expect(plan.deliveries).toEqual([]);
    expect(plan.skipped.map((skip) => skip.reason)).toEqual([
      'DR 168206: branch "ZZZ" is not an ISMS branch',
      "DR 902 sends these units to more than one branch",
    ]);
  });

  it("gives a unit to the earliest DR only", () => {
    const first = dr({ docEntry: 900, docDate: "2026-11-13", lines: [docLine({ serialNos: ["SN-1"] })] });
    const second = dr({ docEntry: 950, docDate: "2026-11-14", lines: [docLine({ serialNos: ["SN-1", "SN-2"] })] });
    const plan = planPulloutRedeliveries({ ...base, redeliveries: [second, first] });
    expect(plan.deliveries).toEqual([
      { dr: first, branchId: "b1", serialNumberIds: ["s1"] },
      { dr: second, branchId: "b1", serialNumberIds: ["s2"] },
    ]);
  });
});
