import {
  normalizeSapCodeKey,
  resolvePermittedBranchRef,
} from "@/features/pixelcare-ai/lib/branch-resolve";

const BRANCHES = [
  {
    id: "clbranchabp00000000000001",
    name: "ABENSON ABREEZA DAVAO",
    sapCode: "ABP001",
  },
  {
    id: "clbranchxyz00000000000002",
    name: "Other Store",
    sapCode: "XYZ999",
  },
];

describe("resolvePermittedBranchRef", () => {
  it("resolves by id, SAP code, and display name", () => {
    expect(resolvePermittedBranchRef(BRANCHES, "clbranchabp00000000000001")?.sapCode).toBe(
      "ABP001",
    );
    expect(resolvePermittedBranchRef(BRANCHES, "ABP001")?.id).toBe(
      "clbranchabp00000000000001",
    );
    expect(resolvePermittedBranchRef(BRANCHES, "abp001")?.id).toBe(
      "clbranchabp00000000000001",
    );
    expect(resolvePermittedBranchRef(BRANCHES, "ABENSON ABREEZA DAVAO")?.sapCode).toBe(
      "ABP001",
    );
  });

  it("resolves common SAP O/0 mistypes within AOR", () => {
    expect(resolvePermittedBranchRef(BRANCHES, "ABPOO1")?.sapCode).toBe("ABP001");
    expect(normalizeSapCodeKey("ABPOO1")).toBe(normalizeSapCodeKey("ABP001"));
  });

  it("does not invent branches outside the permitted set", () => {
    expect(resolvePermittedBranchRef(BRANCHES, "NOPE001")).toBeNull();
    expect(resolvePermittedBranchRef([], "ABP001")).toBeNull();
  });
});
