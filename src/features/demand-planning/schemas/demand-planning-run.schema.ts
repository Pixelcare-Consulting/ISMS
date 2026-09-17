import { z } from "zod";

import { demandPlanningRunParametersSchema } from "@/features/demand-planning/lib/run-snapshot";

export const generateDemandPlanSchema = z.object({
  periodId: z.string().min(1, "Planning period is required"),
  name: z.string().trim().max(120).optional().nullable(),
  dealerIds: z.array(z.string().min(1)).default([]),
  branchIds: z.array(z.string().min(1)).min(1, "Select at least one branch"),
  monthBasisDays: demandPlanningRunParametersSchema.shape.monthBasisDays.default(30.5),
  roundUpToOne: z.boolean().default(true),
  floorAllocationAtZero: z.boolean().default(true),
  quotaMode: demandPlanningRunParametersSchema.shape.quotaMode.default("derive_from_forecast"),
  frequencyOverride: z.number().positive().nullable().default(null),
  supersedesRunId: z.string().min(1).optional().nullable(),
});

export const demandPlanOverrideSchema = z.object({
  runId: z.string().min(1),
  lineId: z.string().min(1),
  field: z.enum(["displayUnits", "forecastQty"]),
  value: z.coerce.number().int().min(0),
});

export const demandPlanRunIdSchema = z.object({
  runId: z.string().min(1),
});

export type GenerateDemandPlanInput = z.infer<typeof generateDemandPlanSchema>;
export type DemandPlanOverrideInput = z.infer<typeof demandPlanOverrideSchema>;
