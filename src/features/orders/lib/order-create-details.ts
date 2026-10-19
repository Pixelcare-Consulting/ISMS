/**
 * Lines written when an order is created.
 * A removed model is left out even if it still has a quantity in memory.
 * Quantity 0 is not stored as a line.
 */
export function buildOrderCreateDetails(
  lines: readonly { modelId: string; requestedQty: number; remarks: string }[],
  removedIds: ReadonlySet<string>,
): { modelId: string; quantity: number; remarks: string | null }[] {
  const seen = new Set<string>();
  const details: { modelId: string; quantity: number; remarks: string | null }[] = [];
  for (const line of lines) {
    if (removedIds.has(line.modelId)) continue;
    if (!Number.isFinite(line.requestedQty) || line.requestedQty < 1) continue;
    if (seen.has(line.modelId)) continue;
    seen.add(line.modelId);
    const remarks = line.remarks.trim();
    details.push({
      modelId: line.modelId,
      quantity: Math.floor(line.requestedQty),
      remarks: remarks ? remarks : null,
    });
  }
  return details;
}

/** Worksheet rows that belong on a saved order. Planogram-only rows stay off the sheet. */
export function worksheetLinesOnOrder<T extends { modelId: string }>(
  lines: readonly T[],
  orderModelIds: ReadonlySet<string>,
): T[] {
  return lines.filter((line) => orderModelIds.has(line.modelId));
}
