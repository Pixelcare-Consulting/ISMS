
import {
  inventoryApprovalLedger,
  type InventoryApprovalDocument,
} from "@/features/inventory-approvals/services/inventory-approval-ledger";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import {
  PULLOUT_ATTACHMENT_OPEN_CODES,
  pulloutAttachmentError,
} from "@/features/logistics/constants/pullout-attachments";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  asWorkflowCode,
  PULLOUT_SETTLED_CODES,
  PULLOUT_WORKFLOW_CODE,
  type PulloutWorkflowCodeKey,
} from "@/features/logistics/constants/workflow-codes";
import {
  checkPulloutSapDocument,
  formatPulloutSapDoc,
  type PulloutSapDocType,
} from "@/features/logistics/lib/pullout-sap-document";
import { recordedProblemsBySerial } from "@/features/logistics/services/pullout-recorded-problems";
import { fetchPulloutSapDocument } from "@/features/logistics/services/pullout-sap-document.service";
import type { AllocatableSerial, HoldCode } from "@/features/logistics/services/posting-planner-types";
import {
  planPulloutApprove,
  planPulloutCreate,
  planPulloutFinalize,
  planPulloutLineApprove,
  planPulloutLineDelete,
  planPulloutReject,
  planPulloutUpdateList,
  PULLOUT_DEFECTIVE_REASON_CODE,
  PULLOUT_LINE_DECISION,
  pulloutClassificationError,
  pulloutCondition,
  pulloutReasonError,
  type PulloutConditionView,
  type PulloutDecisionLineView,
  type PulloutStatus,
} from "@/features/logistics/services/pullout-posting.planner";
import {
  asHoldCode,
  asInventoryCode,
  assertMovable,
  authorizePosting,
  claimHeader,
  claimInventory,
  lockSerialsThenInventoryRows,
  openDocumentIdsBySerial,
  postingError,
  type PostingActor,
  type PostingDb,
} from "@/features/logistics/services/posting-support";
import { STOCK_COUNT_FREEZE_SESSION_STATUSES } from "@/features/stock-audit/constants/stock-count-workflow";
import { prisma } from "@/lib/database/client";
import { buildPulloutAttachmentPath, getObjectStorage } from "@/lib/storage";

const CLAIM_LOST = "One or more serials changed before this pull-out could be saved";

/** A unit being put on a pull-out, with the STK or DEF it starts as. */
type PlannedLine = { serialNumberId: string; priorCode: HoldCode };

export interface PulloutSerialOption {
  serialNumberId: string;
  serialNo: string;
  modelId: string;
  skuCode: string;
  modelName: string;
  inventoryCode: "STK" | "DEF";
  /** Problem already recorded on a defect tag or sales return. Read-only on the pull-out. */
  recordedProblem: string | null;
}

/** The IT or Return a user linked to a sent unit after creating it in SAP. */
export interface PulloutLineSapDocument {
  type: PulloutSapDocType;
  docNum: number;
  /** YYYY-MM-DD */
  docDate: string | null;
  linkedAt: string | null;
  linkedByName: string | null;
}

export interface PulloutSapDocumentLinkInput {
  serialNumberIds: string[];
  docType: PulloutSapDocType;
  docNum: number;
}

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

export interface PulloutCreateInput {
  branchId: string;
  lines: PulloutCreateLine[];
  notes?: string;
}

export interface PulloutAttachment {
  id: string;
  fileName: string;
}

export interface PulloutDetail {
  id: string;
  pulloutNo: string;
  condition: PulloutConditionView | null;
  notes: string | null;
  waybillNo: string | null;
  courierName: string | null;
  createdAt: string;
  createdByName: string | null;
  scheduledAt: string | null;
  scheduledByName: string | null;
  actualScheduledDate: string | null;
  status: { code: string; name: string; color: string | null };
  branch: { id: string; name: string };
  /** Only on pull-outs made before receiving was dropped. */
  warehouse: { id: string; name: string; code: string } | null;
  warehouseLocation: { name: string; code: string } | null;
  /** Set on pull-outs made before the form dropped the reason. */
  reason: { id: string; code: string; name: string; color: string | null } | null;
  attachments: PulloutAttachment[];
  lines: {
    serialNumberId: string;
    decision: string;
    remarks: string | null;
    reasonName: string | null;
    problemDescriptionNames: string[];
    serialNo: string;
    skuCode: string;
    modelName: string;
    priorCode: string | null;
    inventoryCode: string | null;
    classificationNames: string[];
    unitPackingConditionNames: string[];
    accessoryCompletenessNames: string[];
    /** Receipt and in-transit rejection only exist on pull-outs from before receiving was dropped. */
    receivedAt: string | null;
    receivedByName: string | null;
    receivedLocation: { code: string; name: string } | null;
    rejectedAt: string | null;
    rejectedByName: string | null;
    rejectionRemarks: string | null;
    sapDocument: PulloutLineSapDocument | null;
  }[];
  /** Sent: users may link the SAP IT or Return they made by hand. */
  canLinkSapDocuments: boolean;
  history: { id: string; action: string; at: string; userName: string | null }[];
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isSettledPullout(code: string): boolean {
  return (PULLOUT_SETTLED_CODES as readonly string[]).includes(code);
}

function asPulloutStatus(code: string): PulloutStatus | null {
  return asWorkflowCode(PULLOUT_WORKFLOW_CODE, code);
}

function nextNo() {
  return `PLT-${Date.now().toString(36).toUpperCase()}`;
}

async function inventoryIds(tenantId: string) {
  const [stk, def, rsv, fpo, dit] = await Promise.all([
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "STK"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "DEF"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "RSV"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "FPO"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "DIT"),
  ]);
  return { STK: stk, DEF: def, RSV: rsv, FPO: fpo, DIT: dit };
}

async function workflowId(tenantId: string, code: PulloutWorkflowCodeKey) {
  return reasonStatusService.requireCodeId(tenantId, "pullout_workflow", code);
}

async function loadAllocatable(
  tenantId: string,
  branchId: string,
  serialNumberIds: string[],
  exceptPulloutId?: string,
): Promise<AllocatableSerial[]> {
  const unique = [...new Set(serialNumberIds)];
  const [rows, openDocs] = await Promise.all([
    prisma.branchInventory.findMany({
      where: { tenantId, branchId, serialNumberId: { in: unique } },
      select: {
        serialNumberId: true,
        statusCode: { select: { code: true } },
        serialNumber: { select: { serialNo: true, modelId: true } },
        defectReports: {
          where: { status: "pending_inspection" },
          select: { id: true },
          take: 1,
        },
      },
    }),
    openDocumentIdsBySerial(tenantId, unique, { pulloutId: exceptPulloutId }),
  ]);
  const byId = new Map(rows.map((row) => [row.serialNumberId, row]));
  return unique.map((serialNumberId) => {
    const row = byId.get(serialNumberId);
    return {
      serialNumberId,
      serialNo: row?.serialNumber.serialNo,
      modelId: row?.serialNumber.modelId ?? "",
      inventoryCode: asInventoryCode(row?.statusCode.code),
      pendingDefectInspection: (row?.defectReports.length ?? 0) > 0,
      frozenInStockCount: false,
      openDocumentIds: openDocs.get(serialNumberId) ?? [],
    };
  });
}

async function loadPullout(db: PostingDb | typeof prisma, tenantId: string, pulloutId: string) {
  const pullout = await db.branchPullout.findFirst({
    where: { id: pulloutId, tenantId },
    select: {
      id: true,
      pulloutNo: true,
      branchId: true,
      warehouseId: true,
      waybillNo: true,
      courierName: true,
      scheduledAt: true,
      notes: true,
      statusCodeId: true,
      statusCode: { select: { code: true } },
      lines: {
        select: {
          serialNumberId: true,
          decision: true,
          receivedAt: true,
          rejectedAt: true,
          serialNumber: { select: { serialNo: true } },
          priorStatusCodeId: true,
          priorStatusCode: { select: { code: true } },
        },
      },
    },
  });
  if (!pullout) return null;
  const status = asPulloutStatus(pullout.statusCode.code);
  if (!status) return null;
  const serialIds = pullout.lines.map((line) => line.serialNumberId);
  const inventory = serialIds.length
    ? await db.branchInventory.findMany({
        where: { tenantId, branchId: pullout.branchId, serialNumberId: { in: serialIds } },
        select: { serialNumberId: true, statusCode: { select: { code: true } } },
      })
    : [];
  const inventoryBySerial = new Map(inventory.map((row) => [row.serialNumberId, row]));
  const lines: (PulloutDecisionLineView & {
    received: boolean;
    rejected: boolean;
    priorStatusCodeId: string | null;
    serialNo: string;
  })[] = pullout.lines.map((line) => ({
    serialNumberId: line.serialNumberId,
    serialNo: line.serialNumber.serialNo,
    decision: line.decision,
    received: line.receivedAt !== null,
    rejected: line.rejectedAt !== null,
    priorCode: asHoldCode(line.priorStatusCode?.code),
    priorStatusCodeId: line.priorStatusCodeId,
    inventoryCode: asInventoryCode(inventoryBySerial.get(line.serialNumberId)?.statusCode.code),
  }));
  return { ...pullout, status, lines };
}

async function writeHistory(
  tx: PostingDb,
  input: {
    tenantId: string;
    userId: string;
    pulloutNo: string;
    serialNumberIds: string[];
    /** Null when the event does not change the unit's status. */
    status: string | null;
    details: string;
  },
) {
  if (input.serialNumberIds.length === 0) return;
  await tx.serialNumberHistory.createMany({
    data: input.serialNumberIds.map((serialNumberId) => ({
      tenantId: input.tenantId,
      serialNumberId,
      txnType: "pullout" as const,
      details: input.details,
      status: input.status,
      createdById: input.userId,
    })),
  });
}

function approvalDocument(
  tenantId: string,
  pullout: { id: string; pulloutNo: string },
  step: "TL_APPROVAL" | "RECEIVING",
): InventoryApprovalDocument {
  return { tenantId, sourceType: "PULLOUT", sourceId: pullout.id, sourceNo: pullout.pulloutNo, step };
}

async function stampApproval(
  tx: PostingDb,
  pulloutId: string,
  userId: string,
  decision: "approved" | "rejected",
) {
  const existing = await tx.branchPulloutApprovalLevel.findFirst({
    where: { pulloutId, level: 1 },
    select: { id: true },
  });
  const data =
    decision === "approved"
      ? { approvedAt: new Date(), approvedById: userId, rejectedAt: null, rejectedById: null }
      : { rejectedAt: new Date(), rejectedById: userId, approvedAt: null, approvedById: null };
  if (!existing) {
    await tx.branchPulloutApprovalLevel.create({
      data: { pulloutId, level: 1, roleSlug: "tl", ...data },
    });
    return;
  }
  await tx.branchPulloutApprovalLevel.update({ where: { id: existing.id }, data });
}

function displayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

const CHECKLIST_REQUIRED =
  "Choose the classification, unit packing condition, and accessory completeness this pull-out needs for every selected serial";
const CHECKLIST_DUPLICATE =
  "Each classification, packing condition, and accessory completeness can only be chosen once";
const CHECKLIST_INACTIVE =
  "Choose an active classification, unit packing condition, and accessory completeness for every selected serial";

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

function checklistBySerial(lines: readonly PulloutCreateLine[]): Map<string, PulloutCreateLine> {
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
async function assertActiveChecklist(
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
function assertLineDetails(
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

async function defectiveReasonIdFor(
  tenantId: string,
  lines: readonly PlannedLine[],
): Promise<string | null> {
  if (!lines.some((line) => line.priorCode === "DEF")) return null;
  return reasonStatusService.requireCodeId(tenantId, "pullout_reason", PULLOUT_DEFECTIVE_REASON_CODE);
}

/** The details a line saves, whether it was on the request or added by Logistics. */
function lineDetailData(
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

function savedNames(names: readonly (string | null | undefined)[]): string[] {
  return names.flatMap((name) => {
    const trimmed = displayName(name);
    return trimmed ? [trimmed] : [];
  });
}

function problemDescriptionText(
  choice: PulloutCreateLine | undefined,
  namesById: ReadonlyMap<string, string>,
): string | null {
  const names = savedNames((choice?.problemDescriptionIds ?? []).map((id) => namesById.get(id)));
  return names.length > 0 ? names.join(", ") : null;
}

interface ApprovalIds {
  codes: Awaited<ReturnType<typeof inventoryIds>>;
  nextStatusId: string;
  pendingId: string;
}

async function approvalIds(tenantId: string): Promise<ApprovalIds> {
  const [codes, nextStatusId, pendingId] = await Promise.all([
    inventoryIds(tenantId),
    workflowId(tenantId, "for_pullout"),
    workflowId(tenantId, "pending_tl"),
  ]);
  return { codes, nextStatusId, pendingId };
}

/** Moves the whole pull-out to For pull-out. Header Approve and the last line decision both land here. */
async function approveInTx(
  tx: PostingDb,
  actor: PostingActor,
  pulloutId: string,
  { codes, nextStatusId, pendingId }: ApprovalIds,
): Promise<void> {
  const fresh = await loadPullout(tx, actor.tenantId, pulloutId);
  if (!fresh) throw new Error("Pull-out not found");
  const plan = planPulloutApprove(fresh);
  if (!plan.ok) throw new Error(plan.error);
  if (plan.idempotent) return;
  await lockSerialNumbers(
    tx,
    plan.moves.map((move) => move.serialNumberId),
  );
  await claimInventory(tx, {
    tenantId: actor.tenantId,
    branchId: fresh.branchId,
    serialNumberIds: plan.moves.map((move) => move.serialNumberId),
    fromStatusCodeId: codes.RSV,
    toStatusCodeId: codes.FPO,
    userId: actor.userId,
    message: "A serial on this pull-out is not reserved",
  });
  await claimHeader(tx, "branchPullout", {
    id: pulloutId,
    tenantId: actor.tenantId,
    fromStatusCodeIds: [pendingId],
    toStatusCodeId: nextStatusId,
    message: "This pull-out was updated by someone else",
  });
  await tx.branchPulloutLine.updateMany({
    where: { pulloutId, decision: PULLOUT_LINE_DECISION.pending },
    data: {
      decision: PULLOUT_LINE_DECISION.accepted,
      decidedAt: new Date(),
      decidedById: actor.userId,
    },
  });
  await stampApproval(tx, pulloutId, actor.userId, "approved");
  await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh, "TL_APPROVAL"), {
    serialNumberIds: fresh.lines
      .filter((line) => line.decision === PULLOUT_LINE_DECISION.pending)
      .map((line) => line.serialNumberId),
    status: "APPROVED",
    decidedById: actor.userId,
  });
  await writeHistory(tx, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    pulloutNo: fresh.pulloutNo,
    serialNumberIds: plan.moves.map((move) => move.serialNumberId),
    status: "FPO",
    details: `Approved on ${fresh.pulloutNo}`,
  });
  await tx.auditLog.create({
    data: {
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "pullout.approved",
      entityType: "BranchPullout",
      entityId: pulloutId,
      metadata: { pulloutNo: fresh.pulloutNo },
    },
  });
}

export const pulloutPostingService = {
  async listSerials(
    actor: PostingActor,
    branchId: string,
  ): Promise<PulloutSerialOption[]> {
    await authorizePosting(actor, "pullout.create", branchId);
    const codes = await inventoryIds(actor.tenantId);
    const rows = await prisma.branchInventory.findMany({
      where: {
        tenantId: actor.tenantId,
        branchId,
        statusCodeId: { in: [codes.STK, codes.DEF] },
        defectReports: { none: { status: "pending_inspection" } },
        stockCountLines: {
          none: {
            session: {
              tenantId: actor.tenantId,
              status: { in: [...STOCK_COUNT_FREEZE_SESSION_STATUSES] },
            },
          },
        },
        serialNumber: { deletedAt: null },
      },
      select: {
        serialNumberId: true,
        statusCode: { select: { code: true } },
        serialNumber: {
          select: { serialNo: true, modelId: true, model: { select: { skuCode: true, name: true } } },
        },
      },
      orderBy: { serialNumber: { serialNo: "asc" } },
      take: 300,
    });
    const serialIds = rows.map((row) => row.serialNumberId);
    const [openDocs, problems] = await Promise.all([
      openDocumentIdsBySerial(actor.tenantId, serialIds),
      recordedProblemsBySerial(actor.tenantId, serialIds),
    ]);
    return rows.flatMap((row) => {
      if ((openDocs.get(row.serialNumberId) ?? []).length > 0) return [];
      const code = asHoldCode(row.statusCode.code);
      if (!code) return [];
      return [
        {
          serialNumberId: row.serialNumberId,
          serialNo: row.serialNumber.serialNo,
          modelId: row.serialNumber.modelId,
          skuCode: row.serialNumber.model.skuCode,
          modelName: row.serialNumber.model.name,
          inventoryCode: code,
          recordedProblem: problems.get(row.serialNumberId) ?? null,
        },
      ];
    });
  },

  async getDetail(actor: PostingActor, pulloutId: string): Promise<PulloutDetail> {
    const pullout = await prisma.branchPullout.findFirst({
      where: { id: pulloutId, tenantId: actor.tenantId },
      select: {
        id: true,
        pulloutNo: true,
        notes: true,
        waybillNo: true,
        courierName: true,
        createdAt: true,
        scheduledAt: true,
        actualScheduledDate: true,
        createdBy: { select: { name: true } },
        scheduledBy: { select: { name: true } },
        branch: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        warehouseLocation: { select: { name: true, code: true } },
        statusCode: { select: { code: true, name: true, color: true } },
        reasonStatusCode: { select: { id: true, code: true, name: true, color: true } },
        attachments: {
          select: { id: true, fileName: true },
          orderBy: { createdAt: "asc" },
        },
        lines: {
          select: {
            serialNumberId: true,
            decision: true,
            remarks: true,
            receivedAt: true,
            receivedBy: { select: { name: true } },
            receivedLocation: { select: { code: true, name: true } },
            rejectedAt: true,
            rejectedBy: { select: { name: true } },
            rejectionRemarks: true,
            sapDocType: true,
            sapDocNum: true,
            sapDocDate: true,
            sapDocLinkedAt: true,
            sapDocLinkedBy: { select: { name: true } },
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
          },
          orderBy: { serialNumber: { serialNo: "asc" } },
        },
      },
    });
    if (!pullout) throw new Error("Pull-out not found");
    const inventory = pullout.lines.length
      ? await prisma.branchInventory.findMany({
          where: {
            tenantId: actor.tenantId,
            branchId: pullout.branch.id,
            serialNumberId: { in: pullout.lines.map((line) => line.serialNumberId) },
          },
          select: {
            serialNumberId: true,
            statusCode: { select: { code: true } },
          },
        })
      : [];
    const inventoryBySerial = new Map(inventory.map((row) => [row.serialNumberId, row]));
    const history = await prisma.auditLog.findMany({
      where: { tenantId: actor.tenantId, entityType: "BranchPullout", entityId: pullout.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, action: true, createdAt: true, user: { select: { name: true } } },
    });
    return {
      id: pullout.id,
      pulloutNo: pullout.pulloutNo,
      condition: pulloutCondition(
        pullout.lines.map((line) => ({ priorCode: line.priorStatusCode?.code ?? null })),
      ),
      attachments: pullout.attachments,
      notes: pullout.notes,
      waybillNo: pullout.waybillNo,
      courierName: pullout.courierName,
      createdAt: pullout.createdAt.toISOString(),
      createdByName: displayName(pullout.createdBy?.name),
      scheduledAt: pullout.scheduledAt?.toISOString() ?? null,
      scheduledByName: displayName(pullout.scheduledBy?.name),
      actualScheduledDate: pullout.actualScheduledDate?.toISOString() ?? null,
      status: pullout.statusCode,
      branch: pullout.branch,
      warehouse: pullout.warehouse,
      warehouseLocation: pullout.warehouseLocation,
      reason: pullout.reasonStatusCode,
      lines: pullout.lines.map((line) => ({
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
        inventoryCode: inventoryBySerial.get(line.serialNumberId)?.statusCode.code ?? null,
        classificationNames: savedNames(
          line.classifications.map((row) => row.pulloutClassification.name),
        ),
        unitPackingConditionNames: savedNames(
          line.packingConditions.map((row) => row.unitPackingCondition.name),
        ),
        accessoryCompletenessNames: savedNames(
          line.accessoryCompletenesses.map((row) => row.accessoryCompleteness.name),
        ),
        receivedAt: line.receivedAt?.toISOString() ?? null,
        receivedByName: displayName(line.receivedBy?.name),
        receivedLocation: line.receivedLocation,
        rejectedAt: line.rejectedAt?.toISOString() ?? null,
        rejectedByName: displayName(line.rejectedBy?.name),
        rejectionRemarks: line.rejectionRemarks,
        sapDocument:
          line.sapDocType && line.sapDocNum != null
            ? {
                type: line.sapDocType,
                docNum: line.sapDocNum,
                docDate: dateOnly(line.sapDocDate),
                linkedAt: line.sapDocLinkedAt?.toISOString() ?? null,
                linkedByName: displayName(line.sapDocLinkedBy?.name),
              }
            : null,
      })),
      canLinkSapDocuments: isSettledPullout(pullout.statusCode.code),
      history: history.map((row) => ({
        id: row.id,
        action: row.action,
        at: row.createdAt.toISOString(),
        userName: row.user?.name || null,
      })),
    };
  },

  async create(actor: PostingActor, input: PulloutCreateInput) {
    await authorizePosting(actor, "pullout.create", input.branchId);
    const checklist = checklistBySerial(input.lines);
    const problemNames = await assertActiveChecklist(actor.tenantId, input.lines);

    const serials = await loadAllocatable(actor.tenantId, input.branchId, [...checklist.keys()]);
    const plan = planPulloutCreate({ branchId: input.branchId, serials });
    if (!plan.ok) throw new Error(plan.error);
    assertLineDetails(plan.lines, checklist);
    const codes = await inventoryIds(actor.tenantId);
    const statusCodeId = await workflowId(actor.tenantId, "pending_tl");
    const defectiveReasonId = await defectiveReasonIdFor(actor.tenantId, plan.lines);

    try {
      return await prisma.$transaction(async (tx) => {
        const serialIds = plan.lines.map((line) => line.serialNumberId);
        await lockSerialsThenInventoryRows(tx, actor.tenantId, input.branchId, serialIds);
        await assertMovable(actor.tenantId, serialIds);
        const stillOpen = await openDocumentIdsBySerial(actor.tenantId, serialIds);
        if ([...stillOpen.values()].some((ids) => ids.length > 0)) {
          throw new Error("A serial is already on an open transfer or pull-out");
        }
        const reserved = plan.lines.filter((line) => line.nextCode === "RSV").map((line) => line.serialNumberId);
        await claimInventory(tx, {
          tenantId: actor.tenantId,
          branchId: input.branchId,
          serialNumberIds: reserved,
          fromStatusCodeId: codes.STK,
          toStatusCodeId: codes.RSV,
          userId: actor.userId,
          message: CLAIM_LOST,
        });

        const pulloutNo = nextNo();
        const row = await tx.branchPullout.create({
          data: {
            tenantId: actor.tenantId,
            branchId: input.branchId,
            pulloutNo,
            statusCodeId,
            notes: input.notes?.trim() || null,
            createdById: actor.userId,
            lines: {
              create: plan.lines.map((line) => ({
                serialNumberId: line.serialNumberId,
                priorStatusCodeId: codes[line.priorCode],
                ...lineDetailData(line, checklist, defectiveReasonId),
              })),
            },
            approvalLevels: { create: [{ level: 1, roleSlug: "tl" }] },
          },
          select: { id: true, pulloutNo: true },
        });
        await writeHistory(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          pulloutNo: row.pulloutNo,
          serialNumberIds: reserved,
          status: "RSV",
          details: `Reserved on ${row.pulloutNo}`,
        });
        await inventoryApprovalLedger.recordRequested(tx, approvalDocument(actor.tenantId, row, "TL_APPROVAL"), {
          requestedById: actor.userId,
          units: plan.lines.map((line) => {
            const choice = checklist.get(line.serialNumberId);
            return {
              serialNumberId: line.serialNumberId,
              remarks: choice?.remarks,
              problemDescription: problemDescriptionText(choice, problemNames),
            };
          }),
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "pullout.created",
            entityType: "BranchPullout",
            entityId: row.id,
            metadata: {
              pulloutNo: row.pulloutNo,
              condition: pulloutCondition(plan.lines),
              serialCount: plan.lines.length,
            },
          },
        });
        return row;
      });
    } catch (error) {
      throw postingError(error, "Failed to create pull-out");
    }
  },

  async approve(actor: PostingActor, pulloutId: string) {
    await authorizePosting(actor, "pullout.approve", null);
    const current = await loadPullout(prisma, actor.tenantId, pulloutId);
    if (!current) throw new Error("Pull-out not found");
    const preview = planPulloutApprove(current);
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) return { id: current.id, pulloutNo: current.pulloutNo, idempotent: true };

    const ids = await approvalIds(actor.tenantId);

    try {
      await prisma.$transaction((tx) => approveInTx(tx, actor, pulloutId, ids));
    } catch (error) {
      throw postingError(error, "Failed to approve pull-out");
    }

    return { id: current.id, pulloutNo: current.pulloutNo, idempotent: false };
  },

  async approveLine(actor: PostingActor, pulloutId: string, serialNumberId: string) {
    await authorizePosting(actor, "pullout.approve", null);
    const current = await loadPullout(prisma, actor.tenantId, pulloutId);
    if (!current) throw new Error("Pull-out not found");
    const preview = planPulloutLineApprove({ ...current, serialNumberId });
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) return { id: current.id };

    const ids = await approvalIds(actor.tenantId);

    try {
      await prisma.$transaction(async (tx) => {
        // Line actions lock every serial, so two decisions on one pull-out run in turn
        // and the last one always sees that nothing else is pending.
        await lockSerialNumbers(
          tx,
          current.lines.map((line) => line.serialNumberId),
        );
        const fresh = await loadPullout(tx, actor.tenantId, pulloutId);
        if (!fresh) throw new Error("Pull-out not found");
        const plan = planPulloutLineApprove({ ...fresh, serialNumberId });
        if (!plan.ok) throw new Error(plan.error);
        if (plan.idempotent) return;
        await tx.branchPulloutLine.updateMany({
          where: { pulloutId, serialNumberId },
          data: {
            decision: PULLOUT_LINE_DECISION.accepted,
            decidedAt: new Date(),
            decidedById: actor.userId,
          },
        });
        await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh, "TL_APPROVAL"), {
          serialNumberIds: [serialNumberId],
          status: "APPROVED",
          decidedById: actor.userId,
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "pullout.line_approved",
            entityType: "BranchPullout",
            entityId: pulloutId,
            metadata: {
              pulloutNo: fresh.pulloutNo,
              serialNo: fresh.lines.find((line) => line.serialNumberId === serialNumberId)?.serialNo,
            },
          },
        });
        if (plan.completesApproval) await approveInTx(tx, actor, pulloutId, ids);
      });
    } catch (error) {
      throw postingError(error, "Failed to approve this unit");
    }

    return { id: current.id };
  },

  async deleteLine(actor: PostingActor, pulloutId: string, serialNumberId: string) {
    await authorizePosting(actor, "pullout.reject", null);
    const current = await loadPullout(prisma, actor.tenantId, pulloutId);
    if (!current) throw new Error("Pull-out not found");
    const preview = planPulloutLineDelete({ ...current, serialNumberId });
    if (!preview.ok) throw new Error(preview.error);

    const ids = await approvalIds(actor.tenantId);

    try {
      await prisma.$transaction(async (tx) => {
        await lockSerialNumbers(
          tx,
          current.lines.map((line) => line.serialNumberId),
        );
        const fresh = await loadPullout(tx, actor.tenantId, pulloutId);
        if (!fresh) throw new Error("Pull-out not found");
        const plan = planPulloutLineDelete({ ...fresh, serialNumberId });
        if (!plan.ok) throw new Error(plan.error);
        if (plan.restore) {
          await claimInventory(tx, {
            tenantId: actor.tenantId,
            branchId: fresh.branchId,
            serialNumberIds: [plan.restore.serialNumberId],
            fromStatusCodeId: ids.codes.RSV,
            toStatusCodeId: ids.codes[plan.restore.restoreCode],
            userId: actor.userId,
            message: "A reserved serial on this pull-out could not be restored",
          });
          await writeHistory(tx, {
            tenantId: actor.tenantId,
            userId: actor.userId,
            pulloutNo: fresh.pulloutNo,
            serialNumberIds: [plan.restore.serialNumberId],
            status: plan.restore.restoreCode,
            details: `Removed from ${fresh.pulloutNo}`,
          });
        }
        await tx.branchPulloutLine.deleteMany({ where: { pulloutId, serialNumberId } });
        await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh, "TL_APPROVAL"), {
          serialNumberIds: [serialNumberId],
          status: "REJECTED",
          decidedById: actor.userId,
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "pullout.line_deleted",
            entityType: "BranchPullout",
            entityId: pulloutId,
            metadata: {
              pulloutNo: fresh.pulloutNo,
              serialNo: fresh.lines.find((line) => line.serialNumberId === serialNumberId)?.serialNo,
            },
          },
        });
        if (plan.completesApproval) await approveInTx(tx, actor, pulloutId, ids);
      });
    } catch (error) {
      throw postingError(error, "Failed to delete this unit");
    }

    return { id: current.id };
  },

  async addAttachment(actor: PostingActor, pulloutId: string, file: File) {
    const pullout = await prisma.branchPullout.findFirst({
      where: { id: pulloutId, tenantId: actor.tenantId },
      select: {
        pulloutNo: true,
        branchId: true,
        statusCode: { select: { code: true } },
        _count: { select: { attachments: true } },
      },
    });
    if (!pullout) throw new Error("Pull-out not found");
    await authorizePosting(actor, "pullout.create", pullout.branchId);
    if (!PULLOUT_ATTACHMENT_OPEN_CODES.includes(pullout.statusCode.code)) {
      throw new Error("Files can only be attached to an open pull-out");
    }
    const refused = pulloutAttachmentError({
      mimeType: file.type,
      sizeBytes: file.size,
      attachedCount: pullout._count.attachments,
    });
    if (refused) throw new Error(refused);

    const storagePath = buildPulloutAttachmentPath({
      tenantId: actor.tenantId,
      pulloutId,
      fileId: crypto.randomUUID(),
      fileName: file.name,
    });
    const storage = getObjectStorage();
    await storage.upload({
      path: storagePath,
      body: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.branchPulloutAttachment.create({
          data: {
            pulloutId,
            fileName: file.name,
            storagePath,
            mimeType: file.type,
            sizeBytes: file.size,
            uploadedById: actor.userId,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "pullout.attachment_added",
            entityType: "BranchPullout",
            entityId: pulloutId,
            metadata: { pulloutNo: pullout.pulloutNo, fileName: file.name },
          },
        });
      });
    } catch (error) {
      // A file with no row can never be found again, so do not leave it behind.
      await storage.remove(storagePath).catch(() => undefined);
      throw postingError(error, "Failed to attach the file");
    }
  },

  async getAttachment(tenantId: string, attachmentId: string) {
    return prisma.branchPulloutAttachment.findFirst({
      where: { id: attachmentId, pullout: { tenantId } },
      select: { fileName: true, storagePath: true, mimeType: true },
    });
  },

  async reject(actor: PostingActor, pulloutId: string) {
    await authorizePosting(actor, "pullout.reject", null);
    const current = await loadPullout(prisma, actor.tenantId, pulloutId);
    if (!current) throw new Error("Pull-out not found");
    const preview = planPulloutReject(current);
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) return { id: current.id, idempotent: true };

    const codes = await inventoryIds(actor.tenantId);
    const nextStatusId = await workflowId(actor.tenantId, "cancelled");
    const fromIds = await Promise.all(
      (["pending_tl", "requested"] as const).map((code) => workflowId(actor.tenantId, code)),
    );

    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await loadPullout(tx, actor.tenantId, pulloutId);
        if (!fresh) throw new Error("Pull-out not found");
        const plan = planPulloutReject(fresh);
        if (!plan.ok) throw new Error(plan.error);
        if (plan.idempotent) return;
        await lockSerialNumbers(
          tx,
          plan.restores.map((row) => row.serialNumberId),
        );
        for (const prior of ["STK", "DEF"] as const) {
          const ids = plan.restores.filter((row) => row.restoreCode === prior).map((row) => row.serialNumberId);
          await claimInventory(tx, {
            tenantId: actor.tenantId,
            branchId: fresh.branchId,
            serialNumberIds: ids,
            fromStatusCodeId: codes.RSV,
            toStatusCodeId: codes[prior],
            userId: actor.userId,
            message: "A reserved serial on this pull-out could not be restored",
          });
        }
        await claimHeader(tx, "branchPullout", {
          id: pulloutId,
          tenantId: actor.tenantId,
          fromStatusCodeIds: fromIds,
          toStatusCodeId: nextStatusId,
          message: "This pull-out was updated by someone else",
        });
        await stampApproval(tx, pulloutId, actor.userId, "rejected");
        await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh, "TL_APPROVAL"), {
          serialNumberIds: fresh.lines.map((line) => line.serialNumberId),
          status: "REJECTED",
          decidedById: actor.userId,
        });
        for (const prior of ["STK", "DEF"] as const) {
          await writeHistory(tx, {
            tenantId: actor.tenantId,
            userId: actor.userId,
            pulloutNo: fresh.pulloutNo,
            serialNumberIds: plan.restores
              .filter((row) => row.restoreCode === prior)
              .map((row) => row.serialNumberId),
            status: prior,
            details: `Hold released on ${fresh.pulloutNo}`,
          });
        }
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "pullout.rejected",
            entityType: "BranchPullout",
            entityId: pulloutId,
            metadata: {
              pulloutNo: fresh.pulloutNo,
              restoredSerialIds: plan.restores.map((row) => row.serialNumberId),
            },
          },
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to reject pull-out");
    }

    return { id: current.id, idempotent: false };
  },

  async updateList(
    actor: PostingActor,
    input: {
      pulloutId: string;
      waybillNo?: string | null;
      courierName?: string | null;
      scheduledAt?: Date | null;
      actualScheduledDate?: Date | null;
      notes?: string | null;
      serialNumberIds?: string[];
      /** Details for serials not yet on the pull-out, with the same rules as the request. */
      addedLines?: PulloutCreateLine[];
    },
  ) {
    const current = await loadPullout(prisma, actor.tenantId, input.pulloutId);
    if (!current) throw new Error("Pull-out not found");
    await authorizePosting(actor, "pullout.updateList", current.branchId);

    const nextIds = input.serialNumberIds ?? current.lines.map((line) => line.serialNumberId);
    const currentIds = new Set(current.lines.map((line) => line.serialNumberId));
    const nextSet = new Set(nextIds);
    const kept = current.lines.filter((line) => nextSet.has(line.serialNumberId));
    const removed = current.lines.filter((line) => !nextSet.has(line.serialNumberId));
    const addedIds = nextIds.filter((id) => !currentIds.has(id));
    const added = await loadAllocatable(actor.tenantId, current.branchId, addedIds, current.id);
    const plan = planPulloutUpdateList({ status: current.status, kept, removed, added });
    if (!plan.ok) throw new Error(plan.error);
    const addedLines = plan.holds.length > 0 ? (input.addedLines ?? []) : [];
    const addedDetails = plan.holds.length > 0 ? checklistBySerial(addedLines) : new Map();
    assertLineDetails(plan.holds, addedDetails);
    await assertActiveChecklist(actor.tenantId, addedLines);
    const defectiveReasonId = await defectiveReasonIdFor(actor.tenantId, plan.holds);

    const codes = await inventoryIds(actor.tenantId);
    const nextStatusId = await workflowId(actor.tenantId, "pending_logistics");
    const fromIds = await Promise.all(
      (["for_pullout", "pending_logistics"] as const).map((code) => workflowId(actor.tenantId, code)),
    );

    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await loadPullout(tx, actor.tenantId, input.pulloutId);
        if (!fresh) throw new Error("Pull-out not found");
        const freshIds = new Set(fresh.lines.map((line) => line.serialNumberId));
        const freshKept = fresh.lines.filter((line) => nextSet.has(line.serialNumberId));
        const freshRemoved = fresh.lines.filter((line) => !nextSet.has(line.serialNumberId));
        const freshAdded = added.filter((serial) => !freshIds.has(serial.serialNumberId) || addedIds.includes(serial.serialNumberId));
        const freshPlan = planPulloutUpdateList({
          status: fresh.status,
          kept: freshKept,
          removed: freshRemoved,
          added: freshAdded.filter((serial) => !freshIds.has(serial.serialNumberId)),
        });
        if (!freshPlan.ok) throw new Error(freshPlan.error);

        const touchedIds = [
          ...freshPlan.restores.map((row) => row.serialNumberId),
          ...freshPlan.holds.map((hold) => hold.serialNumberId),
        ];
        await lockSerialsThenInventoryRows(tx, actor.tenantId, fresh.branchId, touchedIds);
        await assertMovable(actor.tenantId, touchedIds);
        const holdIds = freshPlan.holds.map((hold) => hold.serialNumberId);
        const stillOpen = await openDocumentIdsBySerial(actor.tenantId, holdIds, {
          pulloutId: fresh.id,
        });
        if ([...stillOpen.values()].some((ids) => ids.length > 0)) {
          throw new Error("A serial is already on an open transfer or pull-out");
        }

        for (const prior of ["STK", "DEF"] as const) {
          const ids = freshPlan.restores
            .filter((row) => row.restoreCode === prior)
            .map((row) => row.serialNumberId);
          const fromCode = prior === "DEF" ? codes.DEF : codes.FPO;
          await claimInventory(tx, {
            tenantId: actor.tenantId,
            branchId: fresh.branchId,
            serialNumberIds: ids,
            fromStatusCodeId: fromCode,
            toStatusCodeId: codes[prior],
            userId: actor.userId,
            message: "A removed serial is not held by this pull-out",
          });
        }

        const stockHolds = freshPlan.holds.filter((hold) => hold.nextCode === "FPO");
        await claimInventory(tx, {
          tenantId: actor.tenantId,
          branchId: fresh.branchId,
          serialNumberIds: stockHolds.map((hold) => hold.serialNumberId),
          fromStatusCodeId: codes.STK,
          toStatusCodeId: codes.FPO,
          userId: actor.userId,
          message: CLAIM_LOST,
        });

        if (freshRemoved.length > 0) {
          await tx.branchPulloutLine.deleteMany({
            where: {
              pulloutId: fresh.id,
              serialNumberId: { in: freshRemoved.map((line) => line.serialNumberId) },
            },
          });
        }
        // Nested details need one create each. Kept lines are not rewritten.
        for (const hold of freshPlan.holds) {
          await tx.branchPulloutLine.create({
            data: {
              pulloutId: fresh.id,
              serialNumberId: hold.serialNumberId,
              priorStatusCodeId: codes[hold.priorCode],
              ...lineDetailData(hold, addedDetails, defectiveReasonId),
            },
          });
        }

        await claimHeader(tx, "branchPullout", {
          id: fresh.id,
          tenantId: actor.tenantId,
          fromStatusCodeIds: fromIds,
          toStatusCodeId: nextStatusId,
          message: "This pull-out was updated by someone else",
        });
        await tx.branchPullout.update({
          where: { id: fresh.id },
          data: {
            waybillNo: input.waybillNo === undefined ? fresh.waybillNo : input.waybillNo?.trim() || null,
            courierName:
              input.courierName === undefined ? fresh.courierName : input.courierName?.trim() || null,
            notes: input.notes === undefined ? fresh.notes : input.notes?.trim() || null,
            ...(input.actualScheduledDate === undefined
              ? {}
              : { actualScheduledDate: input.actualScheduledDate }),
            // Scheduled by follows the schedule, not whoever saved an unrelated edit.
            ...(input.scheduledAt === undefined ||
            input.scheduledAt?.getTime() === fresh.scheduledAt?.getTime()
              ? {}
              : {
                  scheduledAt: input.scheduledAt,
                  scheduledById: input.scheduledAt ? actor.userId : null,
                }),
          },
        });
        await writeHistory(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          pulloutNo: fresh.pulloutNo,
          serialNumberIds: stockHolds.map((hold) => hold.serialNumberId),
          status: "FPO",
          details: `Added to ${fresh.pulloutNo}`,
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "pullout.list_saved",
            entityType: "BranchPullout",
            entityId: fresh.id,
            metadata: { pulloutNo: fresh.pulloutNo, serialCount: nextIds.length },
          },
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to save the pull-out list");
    }

    return { id: current.id, pulloutNo: current.pulloutNo };
  },

  async finalize(actor: PostingActor, pulloutId: string) {
    const current = await loadPullout(prisma, actor.tenantId, pulloutId);
    if (!current) throw new Error("Pull-out not found");
    await authorizePosting(actor, "pullout.finalize", current.branchId);
    const preview = planPulloutFinalize(current);
    if (!preview.ok) throw new Error(preview.error);

    const codes = await inventoryIds(actor.tenantId);
    const nextStatusId = await workflowId(actor.tenantId, "in_transit");
    const pendingLogisticsId = await workflowId(actor.tenantId, "pending_logistics");

    if (!preview.idempotent) {
      try {
        await prisma.$transaction(async (tx) => {
          const fresh = await loadPullout(tx, actor.tenantId, pulloutId);
          if (!fresh) throw new Error("Pull-out not found");
          const plan = planPulloutFinalize(fresh);
          if (!plan.ok) throw new Error(plan.error);
          if (plan.idempotent) return;
          await lockSerialNumbers(
            tx,
            plan.moves.map((move) => move.serialNumberId),
          );
          await assertMovable(
            actor.tenantId,
            plan.moves.map((move) => move.serialNumberId),
          );
          for (const fromCode of ["FPO", "DEF"] as const) {
            const ids = fresh.lines
              .filter((line) => line.inventoryCode === fromCode)
              .map((line) => line.serialNumberId);
            await claimInventory(tx, {
              tenantId: actor.tenantId,
              branchId: fresh.branchId,
              serialNumberIds: ids,
              fromStatusCodeId: codes[fromCode],
              toStatusCodeId: codes.DIT,
              userId: actor.userId,
              message: "Some serials are not ready to leave the branch",
            });
          }
          await claimHeader(tx, "branchPullout", {
            id: pulloutId,
            tenantId: actor.tenantId,
            fromStatusCodeIds: [pendingLogisticsId],
            toStatusCodeId: nextStatusId,
            message: "This pull-out was updated by someone else",
          });
          await writeHistory(tx, {
            tenantId: actor.tenantId,
            userId: actor.userId,
            pulloutNo: fresh.pulloutNo,
            serialNumberIds: plan.moves.map((move) => move.serialNumberId),
            status: "DIT",
            details: `In transit on ${fresh.pulloutNo}`,
          });
          await tx.auditLog.create({
            data: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              action: "pullout.finalized",
              entityType: "BranchPullout",
              entityId: pulloutId,
              metadata: { pulloutNo: fresh.pulloutNo, serialCount: plan.moves.length, status: "in_transit" },
            },
          });
        });
      } catch (error) {
        throw postingError(error, "Failed to send the pull-out");
      }
    }

    return {
      id: current.id,
      pulloutNo: current.pulloutNo,
      status: "in_transit" as const,
      idempotent: preview.idempotent,
    };
  },

  /**
   * Links units of a sent pull-out to the IT or Return a user created by hand in SAP.
   * ISMS posts nothing: it checks the document exists, is not cancelled, and lists every
   * selected serial, then stores its number and date. Linking again replaces the link.
   */
  async linkSapDocument(actor: PostingActor, pulloutId: string, input: PulloutSapDocumentLinkInput) {
    const pullout = await loadSentPullout(actor, pulloutId);
    const ids = [...new Set(input.serialNumberIds)];
    if (ids.length === 0) throw new Error("Select the units this SAP document covers");
    const lineById = new Map(pullout.lines.map((line) => [line.serialNumberId, line]));
    const serialNos = ids.map((id) => {
      const line = lineById.get(id);
      if (!line) throw new Error("One or more units are not on this pull-out");
      return line.serialNumber.serialNo;
    });

    const doc = await fetchPulloutSapDocument(actor.tenantId, input.docType, input.docNum);
    const check = checkPulloutSapDocument(doc, serialNos);
    if (!check.ok) throw new Error(check.error);

    const label = formatPulloutSapDoc(doc.type, doc.docNum);
    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.branchPulloutLine.updateMany({
          where: { pulloutId, serialNumberId: { in: ids } },
          data: {
            sapDocType: doc.type,
            sapDocEntry: doc.docEntry,
            sapDocNum: doc.docNum,
            sapDocDate: doc.docDate ? new Date(`${doc.docDate}T00:00:00.000Z`) : null,
            sapDocLinkedAt: new Date(),
            sapDocLinkedById: actor.userId,
          },
        });
        if (updated.count !== ids.length) {
          throw new Error("This pull-out was updated by someone else");
        }
        await writeHistory(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          pulloutNo: pullout.pulloutNo,
          serialNumberIds: ids,
          status: null,
          details: `SAP ${label} linked on ${pullout.pulloutNo}`,
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "pullout.sap_document_linked",
            entityType: "BranchPullout",
            entityId: pulloutId,
            metadata: {
              pulloutNo: pullout.pulloutNo,
              sapDocType: doc.type,
              sapDocNum: doc.docNum,
              sapDocEntry: doc.docEntry,
              serialNumberIds: ids,
            },
          },
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to link the SAP document");
    }
    return { id: pullout.id, label, linkedCount: ids.length };
  },

  /** Removes a unit's SAP link, e.g. when the wrong number was linked. */
  async unlinkSapDocument(actor: PostingActor, pulloutId: string, serialNumberId: string) {
    const pullout = await loadSentPullout(actor, pulloutId);
    const line = pullout.lines.find((row) => row.serialNumberId === serialNumberId);
    if (!line) throw new Error("That unit is not on this pull-out");
    if (!line.sapDocType || line.sapDocNum == null) return { id: pullout.id, idempotent: true };
    const label = formatPulloutSapDoc(line.sapDocType, line.sapDocNum);

    try {
      await prisma.$transaction(async (tx) => {
        await tx.branchPulloutLine.updateMany({
          where: { pulloutId, serialNumberId },
          data: {
            sapDocType: null,
            sapDocEntry: null,
            sapDocNum: null,
            sapDocDate: null,
            sapDocLinkedAt: null,
            sapDocLinkedById: null,
          },
        });
        await writeHistory(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          pulloutNo: pullout.pulloutNo,
          serialNumberIds: [serialNumberId],
          status: null,
          details: `SAP ${label} unlinked on ${pullout.pulloutNo}`,
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "pullout.sap_document_unlinked",
            entityType: "BranchPullout",
            entityId: pulloutId,
            metadata: {
              pulloutNo: pullout.pulloutNo,
              sapDocType: line.sapDocType,
              sapDocNum: line.sapDocNum,
              serialNumberIds: [serialNumberId],
            },
          },
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to unlink the SAP document");
    }
    return { id: pullout.id, idempotent: false };
  },
};

/** A pull-out the actor may link SAP documents on: sent, and in their scope. */
async function loadSentPullout(actor: PostingActor, pulloutId: string) {
  const pullout = await prisma.branchPullout.findFirst({
    where: { id: pulloutId, tenantId: actor.tenantId },
    select: {
      id: true,
      pulloutNo: true,
      branchId: true,
      statusCode: { select: { code: true } },
      lines: {
        select: {
          serialNumberId: true,
          sapDocType: true,
          sapDocNum: true,
          serialNumber: { select: { serialNo: true } },
        },
      },
    },
  });
  if (!pullout) throw new Error("Pull-out not found");
  await authorizePosting(actor, "pullout.linkSapDocument", pullout.branchId);
  if (!isSettledPullout(pullout.statusCode.code)) {
    throw new Error("Link SAP documents only after the pull-out is sent");
  }
  return pullout;
}
