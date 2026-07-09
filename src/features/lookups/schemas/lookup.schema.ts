import { z } from "zod";

export const lookupWriteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  code: z.string().trim().max(32).optional(),
  parentId: z.string().trim().max(64).optional(),
  class: z.string().trim().max(80).optional(),
});

export const lookupStatusSchema = z.object({
  recordStatus: z.enum(["active", "inactive"]),
});

export type LookupWriteInput = z.infer<typeof lookupWriteSchema>;
