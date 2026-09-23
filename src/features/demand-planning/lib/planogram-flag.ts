import type { PlanogramFlag } from "@/features/demand-planning/engine/demand-planning.types";

/**
 * Planogram flag for the engine: Y = BranchPlanogram row, free = SRP 0 / bundle,
 * blank = history or allowed only.
 */
export function planogramFlagFor(input: {
  hasPlanogramRow: boolean;
  srp: number | null | undefined;
  isFree?: boolean;
}): PlanogramFlag {
  if (input.isFree) return "free";
  if (input.srp == null || input.srp <= 0) return "free";
  if (input.hasPlanogramRow) return "Y";
  return "blank";
}
