/**
 * Match an uploaded branch name after trim, case-insensitively.
 * SAP code is unique; branch name is not, so more than one hit is an error.
 */

export type BranchNameMatch<T> =
  | { status: "matched"; branch: T }
  | { status: "not_found" }
  | { status: "not_unique" };

export function branchNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function indexBranchesByName<T extends { name: string }>(
  branches: readonly T[],
): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const branch of branches) {
    const key = branchNameKey(branch.name);
    const group = index.get(key);
    if (group) group.push(branch);
    else index.set(key, [branch]);
  }
  return index;
}

export function matchBranchByName<T extends { name: string }>(
  index: Map<string, T[]>,
  rawName: string,
): BranchNameMatch<T> {
  const matches = index.get(branchNameKey(rawName));
  if (!matches || matches.length === 0) return { status: "not_found" };
  if (matches.length > 1) return { status: "not_unique" };
  const branch = matches[0];
  if (!branch) return { status: "not_found" };
  return { status: "matched", branch };
}

export function branchNameNotUniqueMessage(branchName: string): string {
  return `More than one branch is named "${branchName.trim()}". Branch name is not unique.`;
}

export function resolveBranchByName<T extends { name: string }>(
  index: Map<string, T[]>,
  rawName: string,
  notFoundMessage: string,
): { branch: T } | { error: string } {
  const match = matchBranchByName(index, rawName);
  switch (match.status) {
    case "matched":
      return { branch: match.branch };
    case "not_found":
      return { error: notFoundMessage };
    case "not_unique":
      return { error: branchNameNotUniqueMessage(rawName) };
    default: {
      const unreachable: never = match;
      return { error: `Unexpected branch match (${JSON.stringify(unreachable)}).` };
    }
  }
}
