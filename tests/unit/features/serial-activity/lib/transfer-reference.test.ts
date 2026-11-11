import {
  transferDecisionLedgerText,
  transferDecisionPrefix,
  transferReferenceLines,
} from "@/features/serial-activity/lib/transfer-reference";

const line = {
  rsNo: "XFR-1",
  drNo: "DR-1",
  decision: "pending",
  remarks: null,
  requestRemarks: null,
};

describe("transferReferenceLines", () => {
  it("shows the RS and DR numbers", () => {
    expect(transferReferenceLines(line)).toEqual(["RS XFR-1 · DR DR-1"]);
  });

  it("shows nothing before approval issues the numbers", () => {
    expect(transferReferenceLines({ ...line, rsNo: null, drNo: null })).toEqual([]);
  });

  it("shows the requester's remark", () => {
    expect(transferReferenceLines({ ...line, requestRemarks: "For display" })).toContain(
      "Request remark: For display",
    );
  });

  it("shows an accepted serial", () => {
    expect(transferReferenceLines({ ...line, decision: "accepted" })).toContain("Accepted");
  });

  it("shows why a serial was rejected", () => {
    expect(
      transferReferenceLines({ ...line, decision: "rejected", remarks: "Damaged box" }),
    ).toContain("Rejected: Damaged box");
  });
});

describe("transferDecisionLedgerText", () => {
  const accepted = `${transferDecisionPrefix("accepted", "XFR-1")} Approval date Nov 5. RS XFR-1. DR DR-1.`;

  it("finds what the ledger wrote for that transfer", () => {
    const history = [
      { txnType: "transfer", details: "Reserved on XFR-1" },
      { txnType: "transfer", details: accepted },
    ];
    expect(transferDecisionLedgerText("XFR-1", "accepted", history)).toBe(accepted);
  });

  it("ignores another transfer on the same serial", () => {
    const history = [{ txnType: "transfer", details: accepted }];
    expect(transferDecisionLedgerText("XFR-2", "accepted", history)).toBeNull();
  });

  it("ignores another decision on the same transfer", () => {
    const history = [{ txnType: "transfer", details: accepted }];
    expect(transferDecisionLedgerText("XFR-1", "rejected", history)).toBeNull();
  });
});
