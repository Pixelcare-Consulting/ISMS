import {
  checkPulloutSapDocument,
  formatPulloutSapDoc,
  parsePulloutSapDocument,
  parseSapDocNum,
  type PulloutSapDocument,
} from "@/features/logistics/lib/pullout-sap-document";

function doc(overrides: Partial<PulloutSapDocument> = {}): PulloutSapDocument {
  return {
    type: "IT",
    docEntry: 10,
    docNum: 494405,
    docDate: "2026-11-12",
    cancelled: false,
    serialNos: ["SN-1", "SN-2"],
    ...overrides,
  };
}

describe("parseSapDocNum", () => {
  it.each([
    ["494405", 494405],
    [" 12 ", 12],
  ])("accepts %p", (input, expected) => {
    expect(parseSapDocNum(input)).toBe(expected);
  });

  it.each(["", "0", "-5", "12a", "IT 12", "1.5", "99999999999"])("refuses %p", (input) => {
    expect(parseSapDocNum(input)).toBeNull();
  });
});

describe("parsePulloutSapDocument", () => {
  it("reads an IT's serials from its stock transfer lines", () => {
    const parsed = parsePulloutSapDocument("IT", {
      DocEntry: 10,
      DocNum: 494405,
      DocDate: "2026-11-12T00:00:00Z",
      StockTransferLines: [
        { SerialNumbers: [{ InternalSerialNumber: "SN-1" }, { InternalSerialNumber: " SN-2 " }] },
        { SerialNumbers: [{ InternalSerialNumber: "SN-1" }] },
      ],
    });
    expect(parsed).toEqual(doc());
  });

  it("reads a Return's serials from its document lines and flags a cancellation", () => {
    const parsed = parsePulloutSapDocument("RETURN", {
      DocEntry: 3,
      DocNum: 14402,
      DocDate: "",
      Cancelled: "tYES",
      DocumentLines: [{ SerialNumbers: [{ InternalSerialNumber: "SN-9" }] }],
    });
    expect(parsed).toEqual({
      type: "RETURN",
      docEntry: 3,
      docNum: 14402,
      docDate: null,
      cancelled: true,
      serialNos: ["SN-9"],
    });
  });

  it("refuses a document without a number", () => {
    expect(parsePulloutSapDocument("IT", { DocEntry: 1 })).toEqual({
      error: "SAP document has no DocEntry/DocNum",
    });
  });
});

describe("checkPulloutSapDocument", () => {
  it("accepts a document that lists every selected serial, ignoring case and spaces", () => {
    expect(checkPulloutSapDocument(doc(), ["sn-1", " SN-2"])).toEqual({ ok: true });
  });

  it("names the serials the document does not list", () => {
    expect(checkPulloutSapDocument(doc(), ["SN-1", "SN-3", "SN-4", "SN-5", "SN-6"])).toEqual({
      ok: false,
      error: "IT: 494405 in SAP does not list SN-3, SN-4, SN-5 and 1 more",
    });
  });

  it("refuses a cancelled document", () => {
    expect(checkPulloutSapDocument(doc({ type: "RETURN", cancelled: true }), ["SN-1"])).toEqual({
      ok: false,
      error: "Return: 494405 is cancelled in SAP",
    });
  });
});

it("labels documents the way delivery screens do", () => {
  expect(formatPulloutSapDoc("IT", 7)).toBe("IT: 7");
  expect(formatPulloutSapDoc("RETURN", 7)).toBe("Return: 7");
});
