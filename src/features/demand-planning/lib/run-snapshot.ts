import { z } from "zod";

import { DEFAULT_DEMAND_PLAN_PARAMETERS } from "@/features/demand-planning/engine/demand-planning.constants";
import type {
  DemandPlanningRunParameters,
  DemandPlanningRunScope,
} from "@/features/demand-planning/engine/demand-planning.types";

export const demandPlanningRunParametersSchema = z.object({
  monthBasisDays: z.number().positive(),
  roundUpToOne: z.boolean(),
  floorAllocationAtZero: z.boolean(),
  quotaMode: z.enum(["derive_from_forecast", "branch_target"]),
  frequencyOverride: z.number().positive().nullable(),
});

export const demandPlanningRunScopeSchema = z.object({
  dealerIds: z.array(z.string().min(1)),
  branchIds: z.array(z.string().min(1)).min(1, "Select at least one branch"),
});

export function defaultRunParameters(): DemandPlanningRunParameters {
  return {
    monthBasisDays: DEFAULT_DEMAND_PLAN_PARAMETERS.monthBasisDays,
    roundUpToOne: DEFAULT_DEMAND_PLAN_PARAMETERS.roundUpToOne,
    floorAllocationAtZero: DEFAULT_DEMAND_PLAN_PARAMETERS.floorAllocationAtZero,
    quotaMode: DEFAULT_DEMAND_PLAN_PARAMETERS.quotaMode,
    frequencyOverride: null,
  };
}

export function parseRunParameters(value: unknown): DemandPlanningRunParameters {
  const parsed = demandPlanningRunParametersSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return defaultRunParameters();
}

export function parseRunScope(value: unknown): DemandPlanningRunScope {
  const parsed = demandPlanningRunScopeSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return { dealerIds: [], branchIds: [] };
}
