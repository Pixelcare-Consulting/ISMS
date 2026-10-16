import { z } from "zod";

export const exportInventoryReportSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  /** Case-insensitive SKU contains. Empty / omitted = no SKU filter. */
  sku: z.string().max(120).optional(),
  /**
   * Inventory status codes (e.g. STK, DIT).
   * Omitted → default STK only. Empty array → all statuses.
   */
  statusCodes: z.array(z.string().min(1).max(32)).optional(),
  /** Optional single branch within the caller's AOR. */
  branchId: z.string().min(1).optional(),
});

export type ExportInventoryReportInput = z.infer<
  typeof exportInventoryReportSchema
>;
