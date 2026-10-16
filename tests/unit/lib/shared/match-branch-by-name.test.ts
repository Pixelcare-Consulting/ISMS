import {
  branchNameNotUniqueMessage,
  indexBranchesByName,
  matchBranchByName,
  resolveBranchByName,
} from "@/lib/shared/match-branch-by-name";

const branches = [
  { id: "1", name: "Western Makati", status: "active" },
  { id: "2", name: "western makati", status: "inactive" },
  { id: "3", name: "  Quezon City  ", status: "active" },
];

describe("match-branch-by-name", () => {
  const index = indexBranchesByName(branches);

  it("matches a single name after trim, ignoring case", () => {
    const match = matchBranchByName(index, "  quezon city ");
    expect(match).toEqual({ status: "matched", branch: branches[2] });
  });

  it("returns not found when no name matches", () => {
    expect(matchBranchByName(index, "Pasig").status).toBe("not_found");
  });

  it("returns not unique when more than one branch shares the name", () => {
    expect(matchBranchByName(index, "Western Makati")).toEqual({ status: "not_unique" });
  });

  it("resolves a unique name and explains a collision", () => {
    expect(
      resolveBranchByName(index, "Quezon City", 'Branch "Quezon City" was not found.'),
    ).toEqual({ branch: branches[2] });
    expect(
      resolveBranchByName(index, "Missing", 'Branch "Missing" was not found.'),
    ).toEqual({ error: 'Branch "Missing" was not found.' });
    expect(resolveBranchByName(index, "Western Makati", "unused")).toEqual({
      error: branchNameNotUniqueMessage("Western Makati"),
    });
  });
});
