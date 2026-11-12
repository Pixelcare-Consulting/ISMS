import {
  TRANSFER_LINE_REMARKS_MAX,
  transferLineRemark,
  transferLineRemarksSchema,
} from "@/features/logistics/lib/transfer-line-remarks";

describe("transferLineRemark", () => {
  it("returns the trimmed remark for that serial", () => {
    expect(transferLineRemark({ s1: "  For display  " }, "s1")).toBe("For display");
  });

  it("stores nothing when the serial has no remark", () => {
    expect(transferLineRemark({ s1: "For display" }, "s2")).toBeNull();
    expect(transferLineRemark(undefined, "s1")).toBeNull();
  });

  it("stores nothing for a blank remark", () => {
    expect(transferLineRemark({ s1: "   " }, "s1")).toBeNull();
  });
});

describe("transferLineRemarksSchema", () => {
  it("accepts a remark at the limit", () => {
    const remarks = { s1: "a".repeat(TRANSFER_LINE_REMARKS_MAX) };
    expect(transferLineRemarksSchema.safeParse(remarks).success).toBe(true);
  });

  it("rejects a remark over the limit", () => {
    const remarks = { s1: "a".repeat(TRANSFER_LINE_REMARKS_MAX + 1) };
    expect(transferLineRemarksSchema.safeParse(remarks).success).toBe(false);
  });

  it("is optional", () => {
    expect(transferLineRemarksSchema.safeParse(undefined).success).toBe(true);
  });
});
