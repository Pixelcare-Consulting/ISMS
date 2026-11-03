import {
  approvalReferenceLines,
  approverIds,
  auditTrailLines,
  decisionReferenceLine,
} from "@/features/serial-activity/lib/approval-reference";

const approvers = new Map([
  ["u-tl", { name: "Juan Cruz", email: "juan@example.com" }],
  ["u-blank", { name: "  ", email: "sp@example.com" }],
]);

describe("approvalReferenceLines", () => {
  it("names who approved each level and when, in level order, in Manila time", () => {
    expect(
      approvalReferenceLines(
        [
          {
            level: 2,
            roleSlug: "sp",
            approvedAt: new Date("2026-10-23T09:30:00Z"),
            approvedById: "u-blank",
            rejectedAt: null,
            rejectedById: null,
          },
          {
            level: 1,
            roleSlug: "tl",
            approvedAt: new Date("2026-10-23T06:15:00Z"),
            approvedById: "u-tl",
            rejectedAt: null,
            rejectedById: null,
          },
        ],
        approvers,
      ),
    ).toEqual([
      expect.stringMatching(/^Approved by Team Leader: Juan Cruz · Oct 23, 2026.*2:15/),
      // Blank name falls back to the email.
      expect.stringMatching(/^Approved by Supply Planning: sp@example\.com · Oct 23, 2026.*5:30/),
    ]);
  });

  it("skips undecided levels and names only the role for a rejection recorded without a user", () => {
    expect(
      approvalReferenceLines(
        [
          {
            level: 1,
            roleSlug: "tl",
            approvedAt: null,
            approvedById: null,
            rejectedAt: null,
            rejectedById: null,
          },
          {
            level: 2,
            roleSlug: "sp",
            approvedAt: null,
            approvedById: null,
            rejectedAt: new Date("2026-10-23T01:00:00Z"),
            rejectedById: null,
          },
        ],
        approvers,
      ),
    ).toEqual([expect.stringMatching(/^Rejected by Supply Planning · Oct 23, 2026/)]);
  });

  it("still shows the approval when the approver is unknown", () => {
    expect(
      approvalReferenceLines(
        [
          {
            level: 1,
            roleSlug: "tl",
            approvedAt: new Date("2026-10-23T01:00:00Z"),
            approvedById: "u-gone",
            rejectedAt: null,
            rejectedById: null,
          },
        ],
        approvers,
      ),
    ).toEqual([expect.stringMatching(/^Approved by Team Leader · /)]);
  });
});

describe("approverIds", () => {
  it("collects distinct approver ids across records", () => {
    const level = {
      level: 1,
      roleSlug: "tl",
      approvedAt: null,
      rejectedAt: null,
      rejectedById: null,
    };
    expect(
      approverIds([
        [{ ...level, approvedById: "a" }],
        [{ ...level, approvedById: "a" }, { ...level, level: 2, approvedById: null }],
        [{ ...level, approvedById: "b" }],
      ]),
    ).toEqual(["a", "b"]);
  });

  it("includes rejectors", () => {
    expect(
      approverIds([
        [
          {
            level: 1,
            roleSlug: "tl",
            approvedAt: null,
            approvedById: null,
            rejectedAt: new Date(),
            rejectedById: "r",
          },
        ],
      ]),
    ).toEqual(["r"]);
  });
});

describe("approvalReferenceLines rejector and comment", () => {
  it("names the rejector and appends the approver's comment", () => {
    expect(
      approvalReferenceLines(
        [
          {
            level: 1,
            roleSlug: "tl",
            approvedAt: null,
            approvedById: null,
            rejectedAt: new Date("2026-10-23T01:00:00Z"),
            rejectedById: "u-tl",
            comment: " wrong branch ",
          },
        ],
        approvers,
      ),
    ).toEqual([
      expect.stringMatching(/^Rejected by Team Leader: Juan Cruz · Oct 23, 2026.* · Note: wrong branch$/),
    ]);
  });
});

describe("decisionReferenceLine", () => {
  it("is null for a step that has not happened", () => {
    expect(decisionReferenceLine("Approved", "Juan", null)).toBeNull();
  });

  it("leaves out the name when unknown", () => {
    expect(decisionReferenceLine("Posted to SAP", null, new Date("2026-10-23T01:00:00Z"))).toMatch(
      /^Posted to SAP · Oct 23, 2026/,
    );
  });
});

describe("auditTrailLines", () => {
  const juan = { name: "Juan Cruz", email: "juan@example.com" };
  const labels = { "x.approved": "Approved", "x.released": "Released", "x.received": "Received" };

  it("keeps this line's and document-wide steps in time order, skipping unknown actions", () => {
    expect(
      auditTrailLines(
        [
          { action: "x.received", at: new Date("2026-10-23T05:00:00Z"), by: juan, lineId: "l1", note: null },
          { action: "x.approved", at: new Date("2026-10-23T01:00:00Z"), by: juan, lineId: "l1", note: "ok" },
          { action: "x.approved", at: new Date("2026-10-23T01:30:00Z"), by: juan, lineId: "l2", note: null },
          { action: "x.released", at: new Date("2026-10-23T02:00:00Z"), by: null, lineId: null, note: null },
          { action: "x.created", at: new Date("2026-10-23T00:00:00Z"), by: juan, lineId: null, note: null },
        ],
        labels,
        "l1",
      ),
    ).toEqual([
      expect.stringMatching(/^Approved by Juan Cruz · .* · Note: ok$/),
      expect.stringMatching(/^Released · /),
      expect.stringMatching(/^Received by Juan Cruz · /),
    ]);
  });
});
