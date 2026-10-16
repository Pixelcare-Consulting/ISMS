export type InventoryGroupAggregates = {
  total: number;
  available: number;
  defective: number;
  reserved: number;
  pendingInspection: number;
};

type AggregateParts = {
  stk: number;
  def: number;
  rsv: number;
  pendingInspection: number;
};

/** STK minus open pending defect reports; pendingInspection is a subset of STK. */
export function inventoryGroupAggregatesFromParts(
  parts: AggregateParts,
): InventoryGroupAggregates {
  const pendingInspection = parts.pendingInspection;
  const available = Math.max(0, parts.stk - pendingInspection);
  const defective = parts.def;
  const reserved = parts.rsv;
  return {
    available,
    defective,
    reserved,
    pendingInspection,
    total: available + pendingInspection + defective + reserved,
  };
}

/** SQL row uses `stk` = STK excluding open pending defect reports. */
export function inventoryGroupAggregatesFromSqlRow(row: {
  stk: number | bigint;
  def: number | bigint;
  rsv: number | bigint;
  pending_inspection: number | bigint;
}): InventoryGroupAggregates {
  const available = Number(row.stk);
  const defective = Number(row.def);
  const reserved = Number(row.rsv);
  const pendingInspection = Number(row.pending_inspection);
  return {
    available,
    defective,
    reserved,
    pendingInspection,
    total: available + defective + reserved + pendingInspection,
  };
}
