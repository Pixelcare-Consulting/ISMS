import { z } from "zod";

export const branchQuotaFormSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  brandId: z.string().min(1, "Brand is required"),
  quotaDate: z.string().min(1, "Quota month is required"),
  quotaAmount: z.coerce.number().positive("Quota must be greater than 0"),
});

export type BranchQuotaFormValues = z.infer<typeof branchQuotaFormSchema>;
