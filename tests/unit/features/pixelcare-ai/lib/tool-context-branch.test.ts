import {
  extractBranchIdFromToolResult,
  parseConversationContext,
} from "@/features/pixelcare-ai/lib/tool-context-branch";

describe("extractBranchIdFromToolResult", () => {
  it("reads branch.id from stock and shelf-gap payloads", () => {
    expect(
      extractBranchIdFromToolResult("checkBranchStock", {
        branch: { id: "clbranchstock000000000001", name: "A", sapCode: "A1" },
      }),
    ).toBe("clbranchstock000000000001");

    expect(
      extractBranchIdFromToolResult("explainShelfGaps", {
        branch: { id: "clbranchshelf000000000001", name: "B", sapCode: "B1" },
      }),
    ).toBe("clbranchshelf000000000001");
  });

  it("uses a single unique order branchId", () => {
    expect(
      extractBranchIdFromToolResult("findOrderStatus", {
        orders: [
          { branchId: "clbranchorder000000000001", orderNumber: "SO-1" },
          { branchId: "clbranchorder000000000001", orderNumber: "SO-2" },
        ],
      }),
    ).toBe("clbranchorder000000000001");
  });

  it("ignores errors, truncated payloads, and multi-branch order results", () => {
    expect(
      extractBranchIdFromToolResult("checkBranchStock", {
        error: "denied",
        branch: { id: "clbranchstock000000000001" },
      }),
    ).toBeNull();

    expect(
      extractBranchIdFromToolResult("checkBranchStock", {
        truncated: true,
        branch: { id: "clbranchstock000000000001" },
      }),
    ).toBeNull();

    expect(
      extractBranchIdFromToolResult("findOrderStatus", {
        orders: [
          { branchId: "clbranchorder000000000001" },
          { branchId: "clbranchorder000000000002" },
        ],
      }),
    ).toBeNull();

    expect(extractBranchIdFromToolResult("explainReturns", { ok: true })).toBeNull();
  });

  it("uses a single unique return branchId from findReturnStatus", () => {
    expect(
      extractBranchIdFromToolResult("findReturnStatus", {
        returns: [
          { branchId: "clbranchret000000000000001", transactionNo: "T1" },
          { branchId: "clbranchret000000000000001", transactionNo: "T2" },
        ],
      }),
    ).toBe("clbranchret000000000000001");
  });
});

describe("parseConversationContext", () => {
  it("parses valid context and rejects junk", () => {
    expect(
      parseConversationContext({
        branchId: "clbranchparse000000000001",
        pathname: "/orders/manual",
      }),
    ).toEqual({
      branchId: "clbranchparse000000000001",
      pathname: "/orders/manual",
    });
    expect(parseConversationContext(null)).toBeNull();
    expect(parseConversationContext({ branchId: "not-a-cuid" })).toBeNull();
  });
});
