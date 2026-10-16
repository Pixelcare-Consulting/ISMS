/** One inventory status on a branch or model row — same codes as the summary cards. */
export type InventoryGroupStatusCount = {
  code: string;
  name: string;
  color: string | null;
  count: number;
};

/**
 * Numeric rollup kept for sellable stock (available excludes units awaiting
 * defect inspection). `total` is available + pending inspection + defective + reserved.
 * `statusCounts` is every inventory status, including zeros when the caller fills them.
 */
export type InventoryGroupCountParts = {
  total: number;
  available: number;
  defective: number;
  reserved: number;
  pendingInspection: number;
  statusCounts: Record<string, number>;
};

export type InventoryGroupAggregates = InventoryGroupCountParts & {
  statuses: InventoryGroupStatusCount[];
};

type AggregateParts = {
  stk: number;
  def: number;
  rsv: number;
  pendingInspection: number;
  statusCounts?: Record<string, number>;
};

export function readGroupStatusCounts(value: unknown): Record<string, number> {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const counts: Record<string, number> = {};
  for (const [code, count] of Object.entries(parsed as Record<string, unknown>)) {
    const parsedCount = Number(count);
    counts[code] = Number.isFinite(parsedCount) ? parsedCount : 0;
  }
  return counts;
}

/** Row chips: only statuses that currently have units. Summary cards still show zeros. */
export function visibleInventoryGroupStatuses(
  statuses: readonly InventoryGroupStatusCount[],
): InventoryGroupStatusCount[] {
  return statuses.filter((status) => status.count > 0);
}

/** Card order, with 0 for statuses that have no units on the row. */
export function inventoryGroupStatusesFromCounts(
  codes: readonly { code: string; name: string; color: string | null }[],
  statusCounts: Record<string, number>,
): InventoryGroupStatusCount[] {
  return codes.map((code) => ({
    code: code.code,
    name: code.name,
    color: code.color,
    count: statusCounts[code.code] ?? 0,
  }));
}

/** STK minus open pending defect reports; pendingInspection is a subset of STK. */
export function inventoryGroupAggregatesFromParts(
  parts: AggregateParts,
): InventoryGroupCountParts {
  const pendingInspection = parts.pendingInspection;
  const available = Math.max(0, parts.stk - pendingInspection);
  const defective = parts.def;
  const reserved = parts.rsv;
  return {
    available,
    defective,
    reserved,
    pendingInspection,
    statusCounts: parts.statusCounts ?? {},
    total: available + pendingInspection + defective + reserved,
  };
}

/** SQL row uses `stk` = STK excluding open pending defect reports. */
export function inventoryGroupAggregatesFromSqlRow(row: {
  stk: number | bigint;
  def: number | bigint;
  rsv: number | bigint;
  pending_inspection: number | bigint;
  status_counts?: unknown;
}): InventoryGroupCountParts {
  const available = Number(row.stk);
  const defective = Number(row.def);
  const reserved = Number(row.rsv);
  const pendingInspection = Number(row.pending_inspection);
  return {
    available,
    defective,
    reserved,
    pendingInspection,
    statusCounts: readGroupStatusCounts(row.status_counts),
    total: available + defective + reserved + pendingInspection,
  };
}
