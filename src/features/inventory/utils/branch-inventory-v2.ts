export type BranchAttentionSource = {
  branch: { id: string; name: string; sapCode: string };
  counts: {
    defective: number;
    total: number;
    notStockedIn?: number;
    statuses?: readonly { count: number }[];
  };
};

export type BranchAttentionKind = "defective" | "off-planogram";

export type BranchAttentionIssue = {
  id: string;
  kind: BranchAttentionKind;
  branchId: string;
  branchName: string;
  sapCode: string;
  count: number;
};

export type BranchSerialSelectionBlock = "missing-serial" | "pending-defect" | "not-stock";

export type NamedStatusCount = {
  code: string;
  name: string;
  count: number;
};

/** Units on a branch row, including statuses that are not part of the sellable total. */
export function branchInventoryUnitTotal(counts: {
  total: number;
  notStockedIn?: number;
  statuses?: readonly { count: number }[];
}): number {
  const statuses = counts.statuses ?? [];
  if (statuses.length === 0) return counts.total;
  return statuses.reduce((sum, status) => sum + status.count, 0) + (counts.notStockedIn ?? 0);
}

function byBranchName(left: BranchAttentionIssue, right: BranchAttentionIssue): number {
  return left.branchName.localeCompare(right.branchName, undefined, { sensitivity: "base" });
}

/**
 * Attention queue: defective branches from the full branch list, then every
 * branch returned by the off-planogram group query. A branch can appear twice.
 */
export function deriveBranchAttentionQueue(input: {
  branches: readonly BranchAttentionSource[];
  offPlanogramBranches: readonly BranchAttentionSource[];
}): BranchAttentionIssue[] {
  const defective = input.branches
    .filter((row) => row.counts.defective > 0)
    .map((row) => ({
      id: `defective:${row.branch.id}`,
      kind: "defective" as const,
      branchId: row.branch.id,
      branchName: row.branch.name,
      sapCode: row.branch.sapCode,
      count: row.counts.defective,
    }))
    .sort(byBranchName);

  const offPlanogram = input.offPlanogramBranches
    .map((row) => ({
      id: `off-planogram:${row.branch.id}`,
      kind: "off-planogram" as const,
      branchId: row.branch.id,
      branchName: row.branch.name,
      sapCode: row.branch.sapCode,
      count: branchInventoryUnitTotal(row.counts),
    }))
    .sort(byBranchName);

  return [...defective, ...offPlanogram];
}

export function branchSerialLabel(serialNo: string): string {
  return serialNo.trim().length > 0 ? serialNo : "Not provided";
}

/** Only in-stock units with a serial, and not already waiting on a defect report. */
export function branchSerialSelectionBlock(unit: {
  serialNo: string;
  statusCode: string;
  pendingDefectInspection: boolean;
}): BranchSerialSelectionBlock | null {
  if (unit.serialNo.trim().length === 0) return "missing-serial";
  if (unit.pendingDefectInspection) return "pending-defect";
  if (unit.statusCode !== "STK") return "not-stock";
  return null;
}

export function statusCountByCode(
  statuses: readonly { code: string; name: string; count: number }[] | undefined,
  code: string,
  fallbackName: string,
): NamedStatusCount {
  const found = statuses?.find((status) => status.code === code);
  return {
    code,
    name: found?.name ?? fallbackName,
    count: found?.count ?? 0,
  };
}

/** Stock decreases and display increases. Defective is intentionally not projected. */
export function projectDisplayUnitMove(
  selectedCount: number,
  statuses: readonly { code: string; name: string; count: number }[] | undefined,
): { stock: NamedStatusCount & { after: number }; display: NamedStatusCount & { after: number } } {
  const stock = statusCountByCode(statuses, "STK", "Stock");
  const display = statusCountByCode(statuses, "DU", "Display unit");
  const moving = Math.max(0, selectedCount);
  return {
    stock: { ...stock, after: Math.max(0, stock.count - moving) },
    display: { ...display, after: display.count + moving },
  };
}
