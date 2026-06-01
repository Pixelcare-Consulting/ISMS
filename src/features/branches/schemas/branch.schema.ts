import { z } from "zod";

export const branchFormSchema = z.object({
  sapCode: z.string().min(1, "SAP code is required"),
  name: z.string().min(2, "Name is required"),
  areaId: z.string().optional(),
  regionId: z.string().optional(),
  provinceId: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type BranchFormValues = z.infer<typeof branchFormSchema>;
