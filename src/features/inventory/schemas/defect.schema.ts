import { z } from "zod";

export const reportDefectSchema = z.object({
  branchInventoryId: z.string().min(1),
  reason: z.string().trim().min(1, "Reason is required").max(500),
  remarks: z.string().trim().max(2000).optional(),
  photoPaths: z
    .array(
      z.object({
        storagePath: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
        sizeBytes: z.number().int().nonnegative(),
      }),
    )
    .max(10)
    .optional(),
});

export const decideDefectSchema = z.object({
  reportId: z.string().min(1),
  decisionRemarks: z.string().trim().max(2000).optional(),
});
