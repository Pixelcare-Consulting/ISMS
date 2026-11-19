import { PULLOUT_DEFECTIVE_REASON_CODE } from "@/features/logistics/services/pullout-posting.planner";
import { prisma } from "@/lib/database/client";

export interface PulloutChecklistOptions {
  classifications: { id: string; name: string }[];
  unitPackingConditions: { id: string; name: string }[];
  accessoryCompleteness: { id: string; name: string }[];
  /** Reasons a stock unit can pick. Defective units are always the DEF reason. */
  reasons: { id: string; name: string }[];
  problemDescriptions: { id: string; name: string }[];
}

export const EMPTY_PULLOUT_CHECKLIST_OPTIONS: PulloutChecklistOptions = {
  reasons: [],
  problemDescriptions: [],
  classifications: [],
  unitPackingConditions: [],
  accessoryCompleteness: [],
};

/** Active pull-out checklist names. Branch and SC pull-out actions gate who may load them. */
export async function loadPulloutChecklistOptions(tenantId: string): Promise<PulloutChecklistOptions> {
  const where = { tenantId, recordStatus: "active" as const };
  const orderBy = { name: "asc" as const };
  const select = { id: true, name: true };
  const [classifications, unitPackingConditions, accessoryCompleteness, problemDescriptions, reasons] =
    await Promise.all([
      prisma.pulloutClassification.findMany({ where, orderBy, select }),
      prisma.unitPackingCondition.findMany({ where, orderBy, select }),
      prisma.accessoryCompleteness.findMany({ where, orderBy, select }),
      prisma.problemDescription.findMany({ where, orderBy, select }),
      prisma.reasonStatusCode.findMany({
        where: {
          ...where,
          code: { not: PULLOUT_DEFECTIVE_REASON_CODE },
          reasonStatus: { category: "pullout_reason" },
        },
        orderBy: { sortOrder: "asc" },
        select,
      }),
    ]);
  return { classifications, unitPackingConditions, accessoryCompleteness, problemDescriptions, reasons };
}
