import { z } from "zod";

import { PULLOUT_LINE_REMARKS_MAX } from "@/features/logistics/services/pullout-posting.planner";

const checklistIdList = z.array(z.string().min(1));

export const pulloutLineSchema = z.object({
  serialNumberId: z.string().min(1),
  /** Stock units only. The service requires it for STK and refuses it for DEF. */
  pulloutReasonCodeId: z.string().min(1).optional(),
  /** Defective units only. The service requires it for DEF and refuses it for STK. */
  problemDescriptionIds: checklistIdList,
  /** Stock units only. The service requires it for STK and refuses it for DEF. */
  pulloutClassificationIds: checklistIdList,
  unitPackingConditionIds: checklistIdList.min(1),
  accessoryCompletenessIds: checklistIdList.min(1),
  remarks: z.string().trim().max(PULLOUT_LINE_REMARKS_MAX).optional(),
});

export const pulloutSchema = z.object({
  branchId: z.string().min(1),
  lines: z.array(pulloutLineSchema).min(1),
  notes: z.string().optional(),
});

export const PULLOUT_CREATE_INPUT_ERROR = "Choose a branch and the details for each serial";

/** Logistics list save, on branch and service center pull-outs. Dates are form strings. */
export const pulloutListSchema = z.object({
  waybillNo: z.string().optional(),
  courierName: z.string().trim().max(120).optional(),
  scheduledAt: z.string().optional(),
  actualPulloutDate: z.string().optional(),
  notes: z.string().optional(),
  serialNumberIds: z.array(z.string().min(1)).min(1),
  addedLines: z.array(pulloutLineSchema).optional(),
});

/** Not sent: leave as is. Blank: clear it. */
export function optionalFormDate(
  value: string | undefined,
  parse: (raw: string) => Date | null,
): Date | null | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (!value.trim()) return null;
  return parse(value) ?? "invalid";
}
