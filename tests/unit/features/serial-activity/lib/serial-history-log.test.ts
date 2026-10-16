import {
  documentReferenceFromHistoryDetails,
  historyActivityForTxn,
  historyTxnTypesForActivity,
} from "@/features/serial-activity/lib/serial-history-log";

describe("documentReferenceFromHistoryDetails", () => {
  it.each([
    ["Dispatched on DLV-ABC123 to Makati", "DLV-ABC123"],
    ["Accepted on DLV-ABC123 at Makati", "DLV-ABC123"],
    ["Returned to warehouse from DLV-ABC123", "DLV-ABC123"],
    ["Reserved on XFR-1", "XFR-1"],
    ["Hold released on XFR-1", "XFR-1"],
    ["Released on XFR-1", "XFR-1"],
    ["Received on XFR-1", "XFR-1"],
    ["Approved on PLT-9", "PLT-9"],
    ["Added to PLT-9", "PLT-9"],
    ["In transit on PLT-9", "PLT-9"],
    ["P-Count session CNT-42", "CNT-42"],
    ["Dispatched on DLV-1.", "DLV-1"],
    [
      "Return SI 100 → STK at branch sold (request abc)",
      "SI 100",
    ],
    [
      "Replacement INV-9 → DEF at branch sold (request abc)",
      "INV-9",
    ],
    ["Replacement sold on same invoice SI-100", "SI-100"],
    ["Replacement sold on new invoice SI-200", "SI-200"],
    ["Posted against SAP-ITR-ABCD1234 yesterday", "SAP-ITR-ABCD1234"],
    ["4500123456", "4500123456"],
    ["Received into WH01 from a local fixture", null],
    ["Stocked in to WH01 / A-01", null],
    ["Defect reported at Makati: cracked screen", null],
    ["Defect approved — unit marked DEF", null],
    ["Defect report rejected — unit remains STK: looks fine", null],
    ["", null],
    ["   ", null],
    [null, null],
  ])("reads %j as %j", (details, expected) => {
    expect(documentReferenceFromHistoryDetails(details)).toBe(expected);
  });
});

describe("historyTxnTypesForActivity", () => {
  it("keeps transfer, sale, pull-out, and count off the history feed", () => {
    expect(historyTxnTypesForActivity()).toEqual([
      "grpo",
      "delivery",
      "backload",
      "inv_acknowledgement",
      "inv_status_update",
      "return",
      "replacement",
      "defect",
    ]);
    expect(historyActivityForTxn("transfer")).toBeNull();
    expect(historyActivityForTxn("pullout")).toBeNull();
    expect(historyActivityForTxn("sales")).toBeNull();
    expect(historyActivityForTxn("reserved_sold")).toBeNull();
    expect(historyActivityForTxn("pcount")).toBeNull();
  });

  it("maps ledger rows onto the existing event filters", () => {
    expect(historyActivityForTxn("inv_status_update")).toEqual({ type: "status" });
    expect(historyActivityForTxn("defect")?.type).toBe("status");
    expect(historyActivityForTxn("delivery")?.type).toBe("transferred");
    expect(historyActivityForTxn("return")?.type).toBe("sold");
    expect(historyActivityForTxn("replacement")?.type).toBe("sold");
    expect(historyActivityForTxn("grpo")?.type).toBe("registered");
    expect(historyTxnTypesForActivity("counted")).toEqual([]);
    expect(historyTxnTypesForActivity("pulled_out")).toEqual([]);
    expect(historyTxnTypesForActivity("sold").sort()).toEqual([
      "replacement",
      "return",
    ]);
  });
});
