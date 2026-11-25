
import {
  inventoryApprovalLedger,
  type InventoryApprovalDocument,
} from "@/features/inventory-approvals/services/inventory-approval-ledger";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import {
  PULLOUT_ATTACHMENT_OPEN_CODES,
  pulloutAttachmentError,
} from "@/features/logistics/constants/pullout-attachments";
import {
  asWorkflowCode,
  PULLOUT_SETTLED_CODES,
  PULLOUT_WORKFLOW_CODE,
} from "@/features/logistics/constants/workflow-codes";
import {
  groupRestores,
  pulloutCancelHistoryText,
  type PulloutCancelLine,
  type PulloutCancelPlan,
} from "@/features/logistics/lib/pullout-cancel";
import { settlePulloutCancelInSap } from "@/features/logistics/services/pullout-cancel.runner";
import type { PulloutSapDocType } from "@/features/logistics/lib/pullout-sap-document";
import { recordedProblemsBySerial } from "@/features/logistics/services/pullout-recorded-problems";
import type { AllocatableSerial } from "@/features/logistics/services/posting-planner-types";
import {
  assertActiveChecklist,
  assertLineDetails,
  checklistBySerial,
  defectiveReasonIdFor,
  displayName,
  lineDetailData,
  problemDescriptionText,
  PULLOUT_LINE_CHECKLIST_SELECT,
  pulloutInventoryIds,
  pulloutLineChecklistView,
  pulloutWorkflowId,
  type PulloutCreateLine,
  type PulloutInventoryIds,
} from "@/features/logistics/services/pullout-line-checklist";
import {
  planPulloutApprove,
  planPulloutCreate,
  planPulloutFinalize,
  planPulloutLineApprove,
  planPulloutLineDelete,
  planPulloutReject,
  planPulloutUpdateList,
  PULLOUT_LINE_DECISION,
  pulloutCondition,
  type PulloutConditionView,
  type PulloutDecisionLineView,
  type PulloutStatus,
} from "@/features/logistics/services/pullout-posting.planner";
import {
  asHoldCode,
  asInventoryCode,
  assertMovable,
  authorizeCreateBranches,
  authorizePosting,
  claimHeader,
  claimInventory,
  lockSerialsThenInventoryRows,
  openDocumentIdsBySerial,
  postingError,
  type PostingActor,
  type PostingDb,
} from "@/features/logistics/services/posting-support";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { STOCK_COUNT_FREEZE_SESSION_STATUSES } from "@/features/stock-audit/constants/stock-count-workflow";
import { prisma } from "@/lib/database/client";
import { buildPulloutAttachmentPath, getObjectStorage } from "@/lib/storage";

const CLAIM_LOST = "One or more serials changed before this pull-out could be saved";

export type { PulloutCreateLine };

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

/** The IT or Return SAP shows for a sent unit (found by Check SAP, or linked by hand before). */
export interface PulloutLineSapDocument {
  type: PulloutSapDocType;
  docNum: number;
  /** YYYY-MM-DD */
  docDate: string | null;
  linkedAt: string | null;
  linkedByName: string | null;
}

/** The ISMS delivery made when SAP redelivered a pulled-out unit. */
export interface PulloutLineRedelivery {
  deliveryId: string;
  deliveryNo: string;
  drNo: string | null;
  /** The branch or service center the DR delivered to. */
  placeName: string;
}

/** A line's stored IT/Return link, as the detail page shows it. Same columns on both ledgers. */
export function pulloutLineSapDocumentView(line: {
  sapDocType: PulloutSapDocType | null;
  sapDocNum: number | null;
  sapDocDate: Date | null;
  sapDocLinkedAt: Date | null;
  sapDocLinkedBy: { name: string | null } | null;
}): PulloutLineSapDocument | null {
  if (!line.sapDocType || line.sapDocNum == null) return null;
  return {
    type: line.sapDocType,
    docNum: line.sapDocNum,
    docDate: dateOnly(line.sapDocDate),
    linkedAt: line.sapDocLinkedAt?.toISOString() ?? null,
    linkedByName: displayName(line.sapDocLinkedBy?.name),
  };
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
  /** Where the units leave from: the branch, or the service center on an SC pull-out. */
  place: { id: string; name: string };
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
    redelivery: PulloutLineRedelivery | null;
  }[];
  /** Sent: Logistics may check SAP for the IT or Return made by hand, and for redeliveries. */
  canCheckSap: boolean;
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
          sapDocType: true,
          sapDocEntry: true,
          redeliveryDeliveryId: true,
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
    linked: PulloutCancelLine["linked"];
    redelivered: boolean;
  })[] = pullout.lines.map((line) => ({
    serialNumberId: line.serialNumberId,
    serialNo: line.serialNumber.serialNo,
    decision: line.decision,
    received: line.receivedAt !== null,
    rejected: line.rejectedAt !== null,
    priorCode: asHoldCode(line.priorStatusCode?.code),
    priorStatusCodeId: line.priorStatusCodeId,
    inventoryCode: asInventoryCode(inventoryBySerial.get(line.serialNumberId)?.statusCode.code),
    linked: line.sapDocType ? { type: line.sapDocType, docEntry: line.sapDocEntry } : null,
    redelivered: line.redeliveryDeliveryId !== null,
  }));
  return { ...pullout, status, lines };
}

/** Serial history rows for pull-out events. Shared with the SAP check. */
export async function writePulloutHistory(
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

/** Restored units log their STK/DEF; units kept on a Return log the cancel with no status change. */
async function writePulloutCancelHistory(
  tx: PostingDb,
  actor: PostingActor,
  pulloutNo: string,
  plan: PulloutCancelPlan,
  sapDone: readonly string[],
) {
  const details = pulloutCancelHistoryText(pulloutNo, sapDone);
  for (const restoreCode of ["STK", "DEF"] as const) {
    await writePulloutHistory(tx, {
      tenantId: actor.tenantId,
      userId: actor.userId,
      pulloutNo,
      serialNumberIds: plan.restores.filter((row) => row.restoreCode === restoreCode).map((row) => row.serialNumberId),
      status: restoreCode,
      details,
    });
  }
  await writePulloutHistory(tx, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    pulloutNo,
    serialNumberIds: plan.keptPulledOutIds,
    status: null,
    details,
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

interface ApprovalIds {
  codes: PulloutInventoryIds;
  nextStatusId: string;
  pendingId: string;
}

async function approvalIds(tenantId: string): Promise<ApprovalIds> {
  const [codes, nextStatusId, pendingId] = await Promise.all([
    pulloutInventoryIds(tenantId),
    pulloutWorkflowId(tenantId, "for_pullout"),
    pulloutWorkflowId(tenantId, "pending_tl"),
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
  await writePulloutHistory(tx, {
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
    const codes = await pulloutInventoryIds(actor.tenantId);
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
            ...PULLOUT_LINE_CHECKLIST_SELECT,
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
            redeliveryDelivery: {
              select: { id: true, deliveryNo: true, drNo: true, branch: { select: { name: true } } },
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
      place: pullout.branch,
      warehouse: pullout.warehouse,
      warehouseLocation: pullout.warehouseLocation,
      reason: pullout.reasonStatusCode,
      lines: pullout.lines.map((line) => ({
        ...pulloutLineChecklistView(
          line,
          inventoryBySerial.get(line.serialNumberId)?.statusCode.code ?? null,
        ),
        receivedAt: line.receivedAt?.toISOString() ?? null,
        receivedByName: displayName(line.receivedBy?.name),
        receivedLocation: line.receivedLocation,
        rejectedAt: line.rejectedAt?.toISOString() ?? null,
        rejectedByName: displayName(line.rejectedBy?.name),
        rejectionRemarks: line.rejectionRemarks,
        sapDocument: pulloutLineSapDocumentView(line),
        redelivery: line.redeliveryDelivery
          ? {
              deliveryId: line.redeliveryDelivery.id,
              deliveryNo: line.redeliveryDelivery.deliveryNo,
              drNo: line.redeliveryDelivery.drNo,
              placeName: line.redeliveryDelivery.branch.name,
            }
          : null,
      })),
      canCheckSap: isSettledPullout(pullout.statusCode.code),
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
    await authorizeCreateBranches(actor, [input.branchId]);
    const checklist = checklistBySerial(input.lines);
    const problemNames = await assertActiveChecklist(actor.tenantId, input.lines);

    const serials = await loadAllocatable(actor.tenantId, input.branchId, [...checklist.keys()]);
    const plan = planPulloutCreate({ branchId: input.branchId, serials });
    if (!plan.ok) throw new Error(plan.error);
    assertLineDetails(plan.lines, checklist);
    const codes = await pulloutInventoryIds(actor.tenantId);
    const statusCodeId = await pulloutWorkflowId(actor.tenantId, "pending_tl");
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
        await writePulloutHistory(tx, {
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
          await writePulloutHistory(tx, {
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

    const codes = await pulloutInventoryIds(actor.tenantId);
    const nextStatusId = await pulloutWorkflowId(actor.tenantId, "cancelled");
    const fromIds = await Promise.all(
      (["pending_tl", "requested"] as const).map((code) => pulloutWorkflowId(actor.tenantId, code)),
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
          await writePulloutHistory(tx, {
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

  /**
   * Cancels a pull-out after Team Lead approval (rules in `lib/pullout-cancel.ts`). SAP goes
   * first: linked Returns are closed, linked ITs cancelled. Then one transaction puts units
   * back to STK or DEF (units on a Return stay Pulled out) and makes the header Cancelled.
   */
  async cancel(actor: PostingActor, pulloutId: string) {
    const current = await loadPullout(prisma, actor.tenantId, pulloutId);
    if (!current) throw new Error("Pull-out not found");
    await authorizePosting(actor, "pullout.cancel", current.branchId);
    if (current.status === "cancelled") return { id: current.id, idempotent: true, sapDone: [] as string[] };

    const { plan, sapDone } = await settlePulloutCancelInSap(actor.tenantId, {
      id: current.id,
      pulloutNo: current.pulloutNo,
      status: current.status,
      lines: current.lines.map((line) => ({
        serialNumberId: line.serialNumberId,
        serialNo: line.serialNo,
        priorCode: line.priorCode,
        inventoryCode: line.inventoryCode,
        linked: line.linked,
        redelivered: line.redelivered,
        legacySettled: line.received || line.rejected,
      })),
    });

    const [codes, pulledOutId, cancelledId] = await Promise.all([
      pulloutInventoryIds(actor.tenantId),
      reasonStatusService.requireCodeId(actor.tenantId, "inventory_system", "PO"),
      pulloutWorkflowId(actor.tenantId, "cancelled"),
    ]);
    const codeIds: Record<string, string> = { ...codes, PO: pulledOutId };
    const groups = groupRestores(plan.restores);

    try {
      await prisma.$transaction(async (tx) => {
        await lockSerialNumbers(
          tx,
          plan.restores.map((row) => row.serialNumberId),
        );
        for (const group of groups) {
          const fromId = codeIds[group.fromCode];
          if (!fromId) throw new Error(`Status code not configured: inventory_system/${group.fromCode}`);
          await claimInventory(tx, {
            tenantId: actor.tenantId,
            branchId: current.branchId,
            serialNumberIds: group.serialNumberIds,
            fromStatusCodeId: fromId,
            toStatusCodeId: codeIds[group.restoreCode],
            userId: actor.userId,
            message: "A serial on this pull-out changed. Reload and try again.",
          });
        }
        await claimHeader(tx, "branchPullout", {
          id: current.id,
          tenantId: actor.tenantId,
          fromStatusCodeIds: [current.statusCodeId],
          toStatusCodeId: cancelledId,
          message: "This pull-out was updated by someone else",
        });
        await writePulloutCancelHistory(tx, actor, current.pulloutNo, plan, sapDone);
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "pullout.cancelled",
            entityType: "BranchPullout",
            entityId: current.id,
            metadata: {
              pulloutNo: current.pulloutNo,
              from: current.status,
              restoredSerialIds: plan.restores.map((row) => row.serialNumberId),
              keptPulledOutSerialIds: plan.keptPulledOutIds,
              sapDone,
            },
          },
        });
      });
    } catch (error) {
      const failure = postingError(error, "Failed to cancel the pull-out");
      if (sapDone.length === 0) throw failure;
      throw new Error(`${sapDone.join(", ")} in SAP, but ISMS could not save the cancel (${failure.message}). Try again.`);
    }

    return { id: current.id, idempotent: false, sapDone };
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

    const codes = await pulloutInventoryIds(actor.tenantId);
    const nextStatusId = await pulloutWorkflowId(actor.tenantId, "pending_logistics");
    const fromIds = await Promise.all(
      (["for_pullout", "pending_logistics"] as const).map((code) => pulloutWorkflowId(actor.tenantId, code)),
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
        await writePulloutHistory(tx, {
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

    const codes = await pulloutInventoryIds(actor.tenantId);
    const nextStatusId = await pulloutWorkflowId(actor.tenantId, "in_transit");
    const pendingLogisticsId = await pulloutWorkflowId(actor.tenantId, "pending_logistics");

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
          await writePulloutHistory(tx, {
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
};
