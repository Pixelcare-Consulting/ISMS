import type { DemandPlanningPlanStatus } from "@prisma/client";

export function drop1QtyForRelease(computedDrop1Qty: number): number {
  if (!Number.isFinite(computedDrop1Qty)) return 0;
  return Math.max(0, Math.trunc(computedDrop1Qty));
}

/**
 * Plan status alone no longer blocks release — Drop 1 qty and open-order
 * checks decide. Kept for callers/tests that still pass planStatus.
 */
export function shouldSkipBranchForRelease(planStatus: DemandPlanningPlanStatus): boolean {
  switch (planStatus) {
    case "planned":
    case "no_history":
    case "awaiting":
      return false;
    default: {
      const _exhaustive: never = planStatus;
      void _exhaustive;
      return false;
    }
  }
}

export function orderDetailsFromDrop1Lines(
  lines: Array<{ modelId: string; computedDrop1Qty: number }>,
): Array<{ modelId: string; quantity: number }> {
  const details: Array<{ modelId: string; quantity: number }> = [];
  for (const line of lines) {
    const quantity = drop1QtyForRelease(line.computedDrop1Qty);
    if (quantity <= 0) continue;
    details.push({ modelId: line.modelId, quantity });
  }
  return details;
}

export function freezeReleasedDrop1Qty(computedDrop1Qty: number): number {
  return drop1QtyForRelease(computedDrop1Qty);
}
