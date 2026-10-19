import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/**
 * One filter shape for every dataset so a report, the Analytics dashboard and
 * a custom dashboard can share a single filter bar. Each loader reads only
 * the fields it needs.
 */
export const datasetParamsSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** Single-day datasets (daily stock). Defaults to today. */
  date: isoDate.optional(),
  sku: z.string().trim().max(120).optional(),
  /** Inventory status codes. Omitted → STK only; empty → all statuses. */
  statusCodes: z.array(z.string().min(1).max(32)).max(50).optional(),
  /** Optional single branch; must sit inside the caller's AOR. */
  branchId: z.string().min(1).max(64).optional(),
});

export type DatasetParams = z.infer<typeof datasetParamsSchema>;
