import { z } from "zod";

import { demandPlanningRunParametersSchema } from "@/features/demand-planning/lib/run-snapshot";

export const replenishmentMatrixQuerySchema = z.object({
  periodId: z.string().min(1).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const workbenchOverrideSchema = z.object({
  modelId: z.string().min(1),
  displayUnits: z.coerce.number().int().min(0),
  forecastQty: z.coerce.number().int().min(0),
});

export const sendWorkbenchSchema = z.object({
  periodId: z.string().min(1, "Planning period is required"),
  branchId: z.string().min(1, "Branch is required"),
  dropsPerMonth: z.coerce.number().positive(),
  quotaMode: demandPlanningRunParametersSchema.shape.quotaMode,
  quotaPeso: z.coerce.number().min(0).optional(),
  selectedModelIds: z.array(z.string().min(1)).min(1, "Select at least one SKU"),
  overrides: z.array(workbenchOverrideSchema).default([]),
});

export type SendWorkbenchInput = z.infer<typeof sendWorkbenchSchema>;
export type ReplenishmentMatrixQuery = z.infer<typeof replenishmentMatrixQuerySchema>;
