import { z } from "zod";

export const TRANSFER_LINE_REMARKS_MAX = 500;

/** The requester's remark per serial, keyed by serial number id. */
export type TransferLineRemarks = Record<string, string>;

export const transferLineRemarksSchema = z
  .record(z.string(), z.string().max(TRANSFER_LINE_REMARKS_MAX))
  .optional();

export function transferLineRemark(
  remarks: TransferLineRemarks | undefined,
  serialNumberId: string,
): string | null {
  return remarks?.[serialNumberId]?.trim() || null;
}
