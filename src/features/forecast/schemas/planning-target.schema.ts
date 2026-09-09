import { z } from "zod";

export const planningTargetCreateSchema = z.object({
  periodId: z.string().min(1, "Planning period is required"),
  branchId: z.string().min(1, "Branch is required"),
  revenueTarget: z.coerce.number().positive("Revenue target must be greater than 0"),
});

export const planningTargetUpdateSchema = z.object({
  id: z.string().min(1, "Target is required"),
  revenueTarget: z.coerce.number().positive("Revenue target must be greater than 0"),
});

export const planningTargetDeleteSchema = z.object({
  id: z.string().min(1, "Target is required"),
});

export const planningTargetBulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one target"),
});

export type PlanningTargetCreateValues = z.infer<typeof planningTargetCreateSchema>;
export type PlanningTargetUpdateValues = z.infer<typeof planningTargetUpdateSchema>;
