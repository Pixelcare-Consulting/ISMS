import { z } from "zod";

export const serialWriteSchema = z.object({
  serialNo: z.string().trim().min(1, "Serial number is required").max(64),
  modelId: z.string().trim().min(1, "Model is required").max(64),
});

export const serialStatusSchema = z.object({
  recordStatus: z.enum(["active", "inactive"]),
});

export type SerialWriteInput = z.infer<typeof serialWriteSchema>;
export type SerialStatusInput = z.infer<typeof serialStatusSchema>;
