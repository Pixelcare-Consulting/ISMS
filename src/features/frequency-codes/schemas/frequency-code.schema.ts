import { z } from "zod";

import { DELIVERY_FREQUENCIES } from "@/features/branches/schemas/branch.schema";

export const frequencyCodeSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(16, "Code is too long")
    .transform((v) => v.trim().toUpperCase()),
  frequency: z.enum(DELIVERY_FREQUENCIES),
  description: z.string().min(1, "Description is required").max(200),
});

export type FrequencyCodeValues = z.infer<typeof frequencyCodeSchema>;
