import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import type { PulloutWorkflowCodeKey } from "@/features/logistics/constants/workflow-codes";
import type { HoldCode } from "@/features/logistics/services/posting-planner-types";
import {
  pulloutClassificationError,
  pulloutReasonError,
  PULLOUT_DEFECTIVE_REASON_CODE,
} from "@/features/logistics/services/pullout-posting.planner";
import { prisma } from "@/lib/database/client";

/**
 * Per-unit pull-out rules shared by branch and service center pull-outs: the checklist each
 * unit needs, the reason it carries, and how its details are saved and read back. Callers own
 * the inventory ledger and the scope checks.
 */

/**
 * Details for one selected serial. Classification and reason are for stock units,
 * problem descriptions for defective ones.
 */
export interface PulloutCreateLine {
  serialNumberId: string;
  pulloutReasonCodeId?: string;
  problemDescriptionIds: string[];
  pulloutClassificationIds: string[];
  unitPackingConditionIds: string[];
  accessoryCompletenessIds: string[];
  remarks?: string;
}

/** A unit being put on a pull-out, with the STK or DEF it starts as. */
export type PlannedLine = { serialNumberId: string; priorCode: HoldCode };

const CHECKLIST_REQUIRED =
  "Choose the classification, unit packing condition, and accessory completeness this pull-out needs for every selected serial";
const CHECKLIST_DUPLICATE =
  "Each classification, packing condition, and accessory completeness can only be chosen once";
const CHECKLIST_INACTIVE =
  "Choose an active classification, unit packing condition, and accessory completeness for every selected serial";

/** Inventory codes a pull-out moves units through. */
export async function pulloutInventoryIds(tenantId: string) {
  const [stk, def, rsv, fpo, dit] = await Promise.all([
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "STK"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "DEF"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "RSV"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "FPO"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "DIT"),
  ]);
  return { STK: stk, DEF: def, RSV: rsv, FPO: fpo, DIT: dit };
}

export type PulloutInventoryIds = Awaited<ReturnType<typeof pulloutInventoryIds>>;

export function pulloutWorkflowId(tenantId: string, code: PulloutWorkflowCodeKey) {
  return reasonStatusService.requireCodeId(tenantId, "pullout_workflow", code);
}

export function displayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

export function savedNames(names: readonly (string | null | undefined)[]): string[] {
  return names.flatMap((name) => {
    const trimmed = displayName(name);
    return trimmed ? [trimmed] : [];
  });
}

function assertNoDuplicateIds(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(CHECKLIST_DUPLICATE);
  }
}

function requireChecklistIds(ids: readonly string[] | undefined): void {
  if (!ids || ids.length === 0 || ids.some((id) => id.length === 0)) {
    throw new Error(CHECKLIST_REQUIRED);
  }
  assertNoDuplicateIds(ids);
}

export function checklistBySerial(lines: readonly PulloutCreateLine[]): Map<string, PulloutCreateLine> {
  if (lines.length === 0) throw new Error("Select the serials to pull out");
  const bySerial = new Map<string, PulloutCreateLine>();
  for (const line of lines) {
    if (!line.serialNumberId) throw new Error(CHECKLIST_REQUIRED);
    assertNoDuplicateIds(line.pulloutClassificationIds);
    assertNoDuplicateIds(line.problemDescriptionIds);
    requireChecklistIds(line.unitPackingConditionIds);
    requireChecklistIds(line.accessoryCompletenessIds);
    if (bySerial.has(line.serialNumberId)) {
      throw new Error("Each serial can only be selected once");
    }
    bySerial.set(line.serialNumberId, line);
  }
  return bySerial;
}

/** Refuses retired choices. Returns the problem description names by id, for the approval trail. */
export async function assertActiveChecklist(
  tenantId: string,
  lines: readonly PulloutCreateLine[],
): Promise<Map<string, string>> {
  const classificationIds = [...new Set(lines.flatMap((line) => line.pulloutClassificationIds))];
  const packingIds = [...new Set(lines.flatMap((line) => line.unitPackingConditionIds))];
  const accessoryIds = [...new Set(lines.flatMap((line) => line.accessoryCompletenessIds))];
  const problemIds = [...new Set(lines.flatMap((line) => line.problemDescriptionIds))];
  const reasonIds = [
    ...new Set(lines.flatMap((line) => (line.pulloutReasonCodeId ? [line.pulloutReasonCodeId] : []))),
  ];
  const [classifications, packings, accessories, problems, reasons] = await Promise.all([
    prisma.pulloutClassification.findMany({
      where: { tenantId, recordStatus: "active", id: { in: classificationIds } },
      select: { id: true },
    }),
    prisma.unitPackingCondition.findMany({
      where: { tenantId, recordStatus: "active", id: { in: packingIds } },
      select: { id: true },
    }),
    prisma.accessoryCompleteness.findMany({
      where: { tenantId, recordStatus: "active", id: { in: accessoryIds } },
      select: { id: true },
    }),
    prisma.problemDescription.findMany({
      where: { tenantId, recordStatus: "active", id: { in: problemIds } },
      select: { id: true, name: true },
    }),
    prisma.reasonStatusCode.findMany({
      where: {
        tenantId,
        recordStatus: "active",
        id: { in: reasonIds },
        code: { not: PULLOUT_DEFECTIVE_REASON_CODE },
        reasonStatus: { category: "pullout_reason" },
      },
      select: { id: true },
    }),
  ]);
  const activeClassifications = new Set(classifications.map((row) => row.id));
  const activePackings = new Set(packings.map((row) => row.id));
  const activeAccessories = new Set(accessories.map((row) => row.id));
  const activeProblems = new Set(problems.map((row) => row.id));
  const activeReasons = new Set(reasons.map((row) => row.id));
  for (const line of lines) {
    if (
      line.pulloutClassificationIds.some((id) => !activeClassifications.has(id)) ||
      line.unitPackingConditionIds.some((id) => !activePackings.has(id)) ||
      line.accessoryCompletenessIds.some((id) => !activeAccessories.has(id)) ||
      line.problemDescriptionIds.some((id) => !activeProblems.has(id)) ||
      (line.pulloutReasonCodeId !== undefined && !activeReasons.has(line.pulloutReasonCodeId))
    ) {
      throw new Error(CHECKLIST_INACTIVE);
    }
  }
  return new Map(problems.map((row) => [row.id, row.name]));
}

/** Every planned unit has details, and they fit its own STK or DEF. */
export function assertLineDetails(
  lines: readonly PlannedLine[],
  details: ReadonlyMap<string, PulloutCreateLine>,
): void {
  if (lines.length !== details.size || lines.some((line) => !details.has(line.serialNumberId))) {
    throw new Error(CHECKLIST_REQUIRED);
  }
  for (const line of lines) {
    const choice = details.get(line.serialNumberId);
    const classificationError = pulloutClassificationError(
      line.priorCode,
      choice?.pulloutClassificationIds.length ?? 0,
    );
    if (classificationError) throw new Error(classificationError);
    const reasonError = pulloutReasonError(
      line.priorCode,
      Boolean(choice?.pulloutReasonCodeId),
      choice?.problemDescriptionIds.length ?? 0,
    );
    if (reasonError) throw new Error(reasonError);
  }
}

export async function defectiveReasonIdFor(
  tenantId: string,
  lines: readonly PlannedLine[],
): Promise<string | null> {
  if (!lines.some((line) => line.priorCode === "DEF")) return null;
  return reasonStatusService.requireCodeId(tenantId, "pullout_reason", PULLOUT_DEFECTIVE_REASON_CODE);
}

/** The details a line saves, whether it was on the request or added by Logistics. */
export function lineDetailData(
  line: PlannedLine,
  details: ReadonlyMap<string, PulloutCreateLine>,
  defectiveReasonId: string | null,
) {
  const choice = details.get(line.serialNumberId);
  if (!choice) throw new Error(CHECKLIST_REQUIRED);
  return {
    remarks: choice.remarks?.trim() || null,
    reasonCodeId: line.priorCode === "DEF" ? defectiveReasonId : choice.pulloutReasonCodeId,
    problemDescriptions: {
      create: choice.problemDescriptionIds.map((problemDescriptionId) => ({ problemDescriptionId })),
    },
    classifications: {
      create: choice.pulloutClassificationIds.map((pulloutClassificationId) => ({
        pulloutClassificationId,
      })),
    },
    packingConditions: {
      create: choice.unitPackingConditionIds.map((unitPackingConditionId) => ({
        unitPackingConditionId,
      })),
    },
    accessoryCompletenesses: {
      create: choice.accessoryCompletenessIds.map((accessoryCompletenessId) => ({
        accessoryCompletenessId,
      })),
    },
  };
}

export function problemDescriptionText(
  choice: PulloutCreateLine | undefined,
  namesById: ReadonlyMap<string, string>,
): string | null {
  const names = savedNames((choice?.problemDescriptionIds ?? []).map((id) => namesById.get(id)));
  return names.length > 0 ? names.join(", ") : null;
}

/** Select for a line's saved checklist. Branch lines and SC detail rows share these relations. */
export const PULLOUT_LINE_CHECKLIST_SELECT = {
  remarks: true,
  decision: true,
  serialNumberId: true,
  priorStatusCode: { select: { code: true } },
  reasonCode: { select: { name: true } },
  problemDescriptions: {
    select: { problemDescription: { select: { name: true } } },
    orderBy: { problemDescription: { name: "asc" } },
  },
  classifications: {
    select: { pulloutClassification: { select: { name: true } } },
    orderBy: { pulloutClassification: { name: "asc" } },
  },
  packingConditions: {
    select: { unitPackingCondition: { select: { name: true } } },
    orderBy: { unitPackingCondition: { name: "asc" } },
  },
  accessoryCompletenesses: {
    select: { accessoryCompleteness: { select: { name: true } } },
    orderBy: { accessoryCompleteness: { name: "asc" } },
  },
  serialNumber: {
    select: { serialNo: true, model: { select: { skuCode: true, name: true } } },
  },
} as const;

interface SavedChecklistLine {
  serialNumberId: string;
  decision: string;
  remarks: string | null;
  priorStatusCode: { code: string } | null;
  reasonCode: { name: string } | null;
  problemDescriptions: { problemDescription: { name: string } }[];
  classifications: { pulloutClassification: { name: string } }[];
  packingConditions: { unitPackingCondition: { name: string } }[];
  accessoryCompletenesses: { accessoryCompleteness: { name: string } }[];
  serialNumber: { serialNo: string; model: { skuCode: string; name: string } };
}

/** The detail view fields every pull-out line has, from `PULLOUT_LINE_CHECKLIST_SELECT`. */
export function pulloutLineChecklistView(line: SavedChecklistLine, inventoryCode: string | null) {
  return {
    serialNumberId: line.serialNumberId,
    decision: line.decision,
    remarks: line.remarks,
    reasonName: line.reasonCode?.name ?? null,
    problemDescriptionNames: savedNames(
      line.problemDescriptions.map((row) => row.problemDescription.name),
    ),
    serialNo: line.serialNumber.serialNo,
    skuCode: line.serialNumber.model.skuCode,
    modelName: line.serialNumber.model.name,
    priorCode: line.priorStatusCode?.code ?? null,
    inventoryCode,
    classificationNames: savedNames(
      line.classifications.map((row) => row.pulloutClassification.name),
    ),
    unitPackingConditionNames: savedNames(
      line.packingConditions.map((row) => row.unitPackingCondition.name),
    ),
    accessoryCompletenessNames: savedNames(
      line.accessoryCompletenesses.map((row) => row.accessoryCompleteness.name),
    ),
  };
}
