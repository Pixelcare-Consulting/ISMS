import type { DemandPlanBranchStatus } from "@/features/demand-planning/engine/demand-planning.types";

/**
 * Same rule as `computeDemandPlan` → `planStatus: "no_history"`:
 * no sales-history mix (and no positive history qty at a priced SKU) in the window.
 */
export function isNoHistoryPlanStatus(
  planStatus: DemandPlanBranchStatus | string,
): boolean {
  return planStatus === "no_history";
}

/**
 * Split computed branches using the engine `no_history` flag.
 * Callers opt in when they want generate-time exclusion.
 */
export function partitionBranchesBySalesHistory<T extends { planStatus: string }>(
  branches: T[],
): { kept: T[]; excluded: T[] } {
  const kept: T[] = [];
  const excluded: T[] = [];
  for (const branch of branches) {
    if (isNoHistoryPlanStatus(branch.planStatus)) {
      excluded.push(branch);
    } else {
      kept.push(branch);
    }
  }
  return { kept, excluded };
}
