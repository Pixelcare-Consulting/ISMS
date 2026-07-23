import { z } from "zod";

export const DELIVERY_FREQUENCIES = [
  "weekly",
  "biweekly",
  "triweekly",
  "monthly",
  "twice_weekly",
] as const;

const weekday = z.number().int().min(0).max(6);

export const branchScheduleSchema = z.object({
  frequencyCodeId: z.string().min(1, "Select a frequency code"),
  deliveryDays: z.array(weekday).min(1, "Select at least one delivery day"),
  orderDays: z.array(weekday).min(1, "Select at least one ordering day"),
  notes: z.string().max(500).optional().nullable(),
  spRemarks: z.string().max(500).optional().nullable(),
});

export type BranchScheduleValues = z.infer<typeof branchScheduleSchema>;

export const branchFormSchema = z.object({
  sapCode: z.string().min(1, "SAP code is required"),
  name: z.string().min(2, "Name is required"),
  areaId: z.string().optional(),
  regionId: z.string().optional(),
  provinceId: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  schedule: branchScheduleSchema.optional().nullable(),
});

export type BranchFormValues = z.infer<typeof branchFormSchema>;
