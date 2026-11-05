import { z } from "zod";

import {
  PULLOUT_LINE_REMARKS_MAX,
  PULLOUT_REJECTION_REMARKS_MAX,
} from "@/features/logistics/services/pullout-posting.planner";

const checklistIdList = z.array(z.string().min(1));

const pulloutLineSchema = z.object({
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

export const pulloutReceiveSchema = z.object({
  lines: z
    .array(
      z.object({
        serialNumberId: z.string().min(1),
        warehouseLocationId: z.string().min(1),
      }),
    )
    .min(1),
});

export const PULLOUT_RECEIVE_INPUT_ERROR = "Choose a warehouse location for every unit";

export const pulloutLineRejectSchema = z.object({
  remarks: z.string().trim().min(1).max(PULLOUT_REJECTION_REMARKS_MAX),
});

export const PULLOUT_LINE_REJECT_INPUT_ERROR = "Enter the reason for rejecting this unit";
