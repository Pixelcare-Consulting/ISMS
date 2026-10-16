import { z } from "zod";

export const pixelcareAiContextSchema = z
  .object({
    branchId: z.string().cuid().optional().nullable(),
    pathname: z.string().max(200).optional().nullable(),
    recordType: z
      .enum(["order", "return", "branch", "planogram", "inventory"])
      .optional()
      .nullable(),
    recordId: z.string().max(80).optional().nullable(),
  })
  .strict();

export type PixelcareAiContext = z.infer<typeof pixelcareAiContextSchema>;
