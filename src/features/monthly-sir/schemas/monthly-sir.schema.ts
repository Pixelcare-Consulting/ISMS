import { z } from "zod";

export const createMonthlySirRequestSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  purpose: z.string().trim().min(3, "Purpose is required").max(500),
});

export const reviewMonthlySirRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  remarks: z.string().trim().max(1000).optional(),
});

export const monthlySirUploadSchema = z.object({
  requestId: z.string().min(1),
});

export const monthlySirScansSchema = z.object({
  requestId: z.string().min(1),
  serialNos: z
    .array(z.string().trim().min(1).max(100))
    .min(1, "Scan at least one serial number")
    .max(10_000, "A maximum of 10,000 serial numbers can be scanned"),
});
