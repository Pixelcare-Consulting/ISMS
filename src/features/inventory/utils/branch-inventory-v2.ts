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

export type BranchChangeableStatus = "STK" | "DU";

export type BranchStatusTarget = "STK" | "DU" | "DEF";

export type BranchSerialSelectionBlock =
  | "missing-serial"
  | "pending-defect"
  | "defective"
  | "not-stock"
  | "other-status";

const CHANGEABLE_STATUS = new Set<string>(["STK", "DU"]);

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

export function branchChangeableStatus(code: string): BranchChangeableStatus | null {
  if (code === "STK" || code === "DU") return code;
  return null;
}

/** Immediate DU from stock, immediate STK from display, and a defect report from either. */
export function branchStatusTargets(
  source: BranchChangeableStatus,
): readonly BranchStatusTarget[] {
  switch (source) {
    case "STK":
      return ["DU", "DEF"];
    case "DU":
      return ["STK", "DEF"];
    default: {
      const unexpected: never = source;
      return unexpected;
    }
  }
}

/**
 * In-stock and display units with a serial can be selected, one current status
 * at a time. Defective units, other statuses, a missing serial, and a pending
 * defect report cannot.
 */
export function branchSerialSelectionBlock(
  unit: {
    serialNo: string;
    statusCode: string;
    pendingDefectInspection: boolean;
  },
  selectedStatus?: BranchChangeableStatus | null,
): BranchSerialSelectionBlock | null {
  if (unit.serialNo.trim().length === 0) return "missing-serial";
  if (unit.pendingDefectInspection) return "pending-defect";
  if (unit.statusCode === "DEF") return "defective";
  const changeable = branchChangeableStatus(unit.statusCode);
  if (!changeable) return "not-stock";
  if (selectedStatus && selectedStatus !== changeable) return "other-status";
  return null;
}

/**
 * Hint when this result has no unit whose status can change.
 * A display unit counts. A partial page that might hold stock or display later does not.
 */
export function branchInventoryChangeableHint(input: {
  items: readonly { statusCode: string }[];
  total: number;
  selectedStatusCode?: string | null;
}): boolean {
  if (input.items.length === 0) return false;
  if (input.items.some((item) => CHANGEABLE_STATUS.has(item.statusCode))) return false;
  const selected = input.selectedStatusCode;
  if (selected && CHANGEABLE_STATUS.has(selected)) return false;
  if (selected && !CHANGEABLE_STATUS.has(selected)) return true;
  return input.total <= input.items.length;
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

/** Display decreases and stock increases. Defective is intentionally not projected. */
export function projectReturnToStockMove(
  selectedCount: number,
  statuses: readonly { code: string; name: string; count: number }[] | undefined,
): { stock: NamedStatusCount & { after: number }; display: NamedStatusCount & { after: number } } {
  const stock = statusCountByCode(statuses, "STK", "Stock");
  const display = statusCountByCode(statuses, "DU", "Display unit");
  const moving = Math.max(0, selectedCount);
  return {
    stock: { ...stock, after: stock.count + moving },
    display: { ...display, after: Math.max(0, display.count - moving) },
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
