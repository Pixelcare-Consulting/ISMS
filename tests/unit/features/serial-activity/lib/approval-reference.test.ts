import {
  approvalReferenceLines,
  approverIds,
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
          },
          {
            level: 1,
            roleSlug: "tl",
            approvedAt: new Date("2026-10-23T06:15:00Z"),
            approvedById: "u-tl",
            rejectedAt: null,
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

  it("skips undecided levels and reports a rejection without a name", () => {
    expect(
      approvalReferenceLines(
        [
          { level: 1, roleSlug: "tl", approvedAt: null, approvedById: null, rejectedAt: null },
          {
            level: 2,
            roleSlug: "sp",
            approvedAt: null,
            approvedById: null,
            rejectedAt: new Date("2026-10-23T01:00:00Z"),
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
          },
        ],
        approvers,
      ),
    ).toEqual([expect.stringMatching(/^Approved by Team Leader · /)]);
  });
});

describe("approverIds", () => {
  it("collects distinct approver ids across records", () => {
    const level = { level: 1, roleSlug: "tl", approvedAt: null, rejectedAt: null };
    expect(
      approverIds([
        [{ ...level, approvedById: "a" }],
        [{ ...level, approvedById: "a" }, { ...level, level: 2, approvedById: null }],
        [{ ...level, approvedById: "b" }],
      ]),
    ).toEqual(["a", "b"]);
  });
});
