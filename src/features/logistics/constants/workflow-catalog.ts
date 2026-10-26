import type { ReasonStatusCategory } from "@prisma/client";

import {
  toWorkflowStatusOptions,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";

/** Active codes for one Status settings tab, in the saved order. */
export async function loadWorkflowCatalog(
  tenantId: string,
  category: ReasonStatusCategory,
): Promise<WorkflowStatusOption[]> {
  const rows = await reasonStatusService.listActiveCodes(tenantId, category);
  return toWorkflowStatusOptions(rows);
}
