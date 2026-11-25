import { Prisma } from "@/lib/database/generated/prisma/client";

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
import { assertExclusiveClaim } from "@/features/logistics/services/delivery-posting.planner";
import {
  OPEN_PULLOUT_STATUS_CODES,
  type AllocatableSerial,
} from "@/features/logistics/services/posting-planner-types";
import {
  asHoldCode,
  asInventoryCode,
  postingError,
  type PostingActor,
  type PostingDb,
} from "@/features/logistics/services/posting-support";
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
  type PulloutDecisionLineView,
  type PulloutStatus,
} from "@/features/logistics/services/pullout-posting.planner";
import {
  pulloutLineSapDocumentView,
  writePulloutHistory,
  type PulloutDetail,
  type PulloutSerialOption,
} from "@/features/logistics/services/pullout-posting.service";
import {
  groupRestores,
  pulloutCancelHistoryText,
  type PulloutCancelLine,
} from "@/features/logistics/lib/pullout-cancel";
import { settlePulloutCancelInSap } from "@/features/logistics/services/pullout-cancel.runner";
import { recordedProblemsBySerial } from "@/features/logistics/services/pullout-recorded-problems";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { resolveScPulloutCapabilities } from "@/features/service-center-ops/constants/sc-permissions";
import {
  assertScInScope,
  resolveScIdsForUser,
} from "@/features/service-center-ops/services/sc-scope";
import { assertSerialsNotFrozenInStockCount } from "@/features/stock-audit/services/stock-count-freeze";
import { prisma } from "@/lib/database/client";
import { buildPulloutAttachmentPath, getObjectStorage } from "@/lib/storage";

/**
 * Service center pull-outs. The branch pull-out flow (request → Team Lead → logistics list →
 * Send) on `ServiceCenterInventory`: units at any location of one service center, STK → RSV
 * → FPO → DIT and DEF → DEF → DIT. It ends at Send, like branch pull-outs, and posts nothing
 * to SAP. Check SAP afterwards lives in `sc-pullout-sap-check.service.ts`.
 */

const CLAIM_LOST = "One or more serials changed before this pull-out could be saved";
const ENTITY_TYPE = "ServiceCenterPullout";
const DENIED = "You do not have permission for this service center pull-out action";
const NOT_FOUND = "Pull-out not found";
const UPDATED_ELSEWHERE = "This pull-out was updated by someone else";

type ScPulloutAction = "create" | "approve" | "reject" | "updateList" | "finalize" | "checkSap" | "cancel";

export interface ScPulloutCreateInput {
  serviceCenterId: string;
  lines: PulloutCreateLine[];
  notes?: string;
}

export interface ScPulloutListInput {
  pulloutId: string;
  waybillNo?: string | null;
  courierName?: string | null;
  scheduledAt?: Date | null;
  actualScheduledDate?: Date | null;
  notes?: string | null;
  serialNumberIds?: string[];
  /** Details for serials not yet on the pull-out, with the same rules as the request. */
  addedLines?: PulloutCreateLine[];
}

function nextNo() {
  return `SCP-${Date.now().toString(36).toUpperCase()}`;
}

function asPulloutStatus(code: string | null | undefined): PulloutStatus | null {
  return code ? asWorkflowCode(PULLOUT_WORKFLOW_CODE, code) : null;
}

function permissionError(actor: PostingActor, action: ScPulloutAction): string | null {
  const caps = resolveScPulloutCapabilities(actor.permissions);
  switch (action) {
    case "create":
      return caps.canCreate ? null : DENIED;
    case "approve":
      return caps.canApproveTl ? null : DENIED;
    case "reject":
      return caps.canRejectTransfer ? null : DENIED;
    case "updateList":
    case "finalize":
    case "checkSap":
    case "cancel":
      return caps.canManage ? null : DENIED;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/** Same gates as branch pull-outs: Team Lead decisions are not scoped, the rest are. */
export async function authorizeScPullout(
  actor: PostingActor,
  action: ScPulloutAction,
  serviceCenterId: string | null,
): Promise<void> {
  const denied = permissionError(actor, action);
  if (denied) throw new Error(denied);
  if (!serviceCenterId) return;
  const scope = await resolveScIdsForUser(actor.tenantId, actor.userId, actor.permissions);
  assertScInScope(serviceCenterId, scope);
}

function approvalDocument(
  tenantId: string,
  pullout: { id: string; pulloutNo: string },
): InventoryApprovalDocument {
  return {
    tenantId,
    sourceType: "SC_PULLOUT",
    sourceId: pullout.id,
    sourceNo: pullout.pulloutNo,
    step: "TL_APPROVAL",
  };
}

async function audit(
  tx: PostingDb,
  actor: PostingActor,
  pulloutId: string,
  action: string,
  metadata: Prisma.InputJsonObject,
) {
  await tx.auditLog.create({
    data: {
      tenantId: actor.tenantId,
      userId: actor.userId,
      action,
      entityType: ENTITY_TYPE,
      entityId: pulloutId,
      metadata,
    },
  });
}

/** Other open SC pull-outs already holding each serial. */
async function openPulloutIdsBySerial(
  db: PostingDb | typeof prisma,
  tenantId: string,
  serialNumberIds: readonly string[],
  exceptPulloutId?: string,
): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (serialNumberIds.length === 0) return grouped;
  const rows = await db.serviceCenterPulloutDetail.findMany({
    where: {
      serialNumberId: { in: [...serialNumberIds] },
      ...(exceptPulloutId ? { pulloutId: { not: exceptPulloutId } } : {}),
      pullout: {
        tenantId,
        statusCode: { code: { in: [...OPEN_PULLOUT_STATUS_CODES] } },
      },
    },
    select: { serialNumberId: true, pulloutId: true },
  });
  for (const row of rows) {
    grouped.set(row.serialNumberId, [...(grouped.get(row.serialNumberId) ?? []), row.pulloutId]);
  }
  return grouped;
}

async function assertNotOnOtherPullout(
  tx: PostingDb,
  tenantId: string,
  serialNumberIds: readonly string[],
  exceptPulloutId?: string,
) {
  const open = await openPulloutIdsBySerial(tx, tenantId, serialNumberIds, exceptPulloutId);
  if ([...open.values()].some((ids) => ids.length > 0)) {
    throw new Error("A serial is already on an open pull-out");
  }
}

/** Serial masters first, in id order, then the SC ledger rows: the branch lock order. */
export async function lockSerialsThenScRows(
  tx: PostingDb,
  tenantId: string,
  serviceCenterId: string,
  serialNumberIds: string[],
): Promise<void> {
  if (serialNumberIds.length === 0) return;
  await lockSerialNumbers(tx, serialNumberIds);
  await tx.$queryRaw`
    SELECT id
    FROM service_center_inventories
    WHERE tenant_id = ${tenantId}
      AND service_center_id = ${serviceCenterId}
      AND serial_number_id IN (${Prisma.join(serialNumberIds)})
    ORDER BY serial_number_id
    FOR UPDATE
  `;
}

/** Moves units on the SC ledger only if every one is still at `from`. */
export async function claimScInventory(
  tx: PostingDb,
  input: {
    tenantId: string;
    serviceCenterId: string;
    serialNumberIds: string[];
    fromStatusCodeId: string;
    toStatusCodeId: string;
    message: string;
  },
): Promise<void> {
  if (input.serialNumberIds.length === 0) return;
  const moved = await tx.serviceCenterInventory.updateMany({
    where: {
      tenantId: input.tenantId,
      serviceCenterId: input.serviceCenterId,
      serialNumberId: { in: input.serialNumberIds },
      statusCodeId: input.fromStatusCodeId,
    },
    data: { statusCodeId: input.toStatusCodeId },
  });
  assertExclusiveClaim(moved.count, input.serialNumberIds.length, input.message);
}

export async function claimScPulloutHeader(
  tx: PostingDb,
  input: { id: string; tenantId: string; fromStatusCodeIds: string[]; toStatusCodeId: string },
): Promise<void> {
  const claimed = await tx.serviceCenterPullout.updateMany({
    where: { id: input.id, tenantId: input.tenantId, statusCodeId: { in: input.fromStatusCodeIds } },
    data: { statusCodeId: input.toStatusCodeId },
  });
  assertExclusiveClaim(claimed.count, 1, UPDATED_ELSEWHERE);
}

async function stampApproval(
  tx: PostingDb,
  pulloutId: string,
  userId: string,
  decision: "approved" | "rejected",
) {
  const data =
    decision === "approved"
      ? { approvedAt: new Date(), approvedById: userId, rejectedAt: null, rejectedById: null }
      : { rejectedAt: new Date(), rejectedById: userId, approvedAt: null, approvedById: null };
  await tx.serviceCenterPulloutApprovalLevel.upsert({
    where: { pulloutId_level: { pulloutId, level: 1 } },
    create: { pulloutId, level: 1, roleSlug: "tl", ...data },
    update: data,
  });
}

async function loadAllocatable(
  tenantId: string,
  serviceCenterId: string,
  serialNumberIds: string[],
  exceptPulloutId?: string,
): Promise<AllocatableSerial[]> {
  const unique = [...new Set(serialNumberIds)];
  const [rows, openDocs] = await Promise.all([
    prisma.serviceCenterInventory.findMany({
      where: { tenantId, serviceCenterId, serialNumberId: { in: unique } },
      select: {
        serialNumberId: true,
        statusCode: { select: { code: true } },
        serialNumber: { select: { serialNo: true, modelId: true } },
      },
    }),
    openPulloutIdsBySerial(prisma, tenantId, unique, exceptPulloutId),
  ]);
  const byId = new Map(rows.map((row) => [row.serialNumberId, row]));
  return unique.map((serialNumberId) => {
    const row = byId.get(serialNumberId);
    return {
      serialNumberId,
      serialNo: row?.serialNumber.serialNo,
      modelId: row?.serialNumber.modelId ?? "",
      inventoryCode: asInventoryCode(row?.statusCode?.code),
      pendingDefectInspection: false,
      frozenInStockCount: false,
      openDocumentIds: openDocs.get(serialNumberId) ?? [],
    };
  });
}

async function loadPullout(db: PostingDb | typeof prisma, tenantId: string, pulloutId: string) {
  const pullout = await db.serviceCenterPullout.findFirst({
    where: { id: pulloutId, tenantId },
    select: {
      id: true,
      pulloutNo: true,
      serviceCenterId: true,
      waybillNo: true,
      courierName: true,
      scheduledAt: true,
      notes: true,
      statusCodeId: true,
      statusCode: { select: { code: true } },
      details: {
        select: {
          serialNumberId: true,
          decision: true,
          serialNumber: { select: { serialNo: true } },
          priorStatusCode: { select: { code: true } },
          sapDocType: true,
          sapDocEntry: true,
          redeliveryDeliveryId: true,
        },
      },
    },
  });
  if (!pullout) return null;
  const status = asPulloutStatus(pullout.statusCode?.code);
  if (!status) return null;
  const serialIds = pullout.details.map((line) => line.serialNumberId);
  const inventory = serialIds.length
    ? await db.serviceCenterInventory.findMany({
        where: { tenantId, serviceCenterId: pullout.serviceCenterId, serialNumberId: { in: serialIds } },
        select: { serialNumberId: true, statusCode: { select: { code: true } } },
      })
    : [];
  const inventoryBySerial = new Map(inventory.map((row) => [row.serialNumberId, row]));
  const lines: (PulloutDecisionLineView & PulloutCancelLine)[] = pullout.details.map((line) => ({
    serialNumberId: line.serialNumberId,
    serialNo: line.serialNumber.serialNo,
    decision: line.decision,
    priorCode: asHoldCode(line.priorStatusCode?.code),
    inventoryCode: asInventoryCode(inventoryBySerial.get(line.serialNumberId)?.statusCode?.code),
    linked: line.sapDocType ? { type: line.sapDocType, docEntry: line.sapDocEntry } : null,
    redelivered: line.redeliveryDeliveryId !== null,
    // SC pull-outs never had the old receiving step.
    legacySettled: false,
  }));
  return { ...pullout, status, lines };
}

type LoadedPullout = NonNullable<Awaited<ReturnType<typeof loadPullout>>>;

async function requirePullout(db: PostingDb | typeof prisma, tenantId: string, pulloutId: string) {
  const pullout = await loadPullout(db, tenantId, pulloutId);
  if (!pullout) throw new Error(NOT_FOUND);
  return pullout;
}

function serialNoOf(pullout: LoadedPullout, serialNumberId: string) {
  return pullout.lines.find((line) => line.serialNumberId === serialNumberId)?.serialNo;
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
  const fresh = await requirePullout(tx, actor.tenantId, pulloutId);
  const plan = planPulloutApprove(fresh);
  if (!plan.ok) throw new Error(plan.error);
  if (plan.idempotent) return;
  const moved = plan.moves.map((move) => move.serialNumberId);
  await lockSerialNumbers(tx, moved);
  await claimScInventory(tx, {
    tenantId: actor.tenantId,
    serviceCenterId: fresh.serviceCenterId,
    serialNumberIds: moved,
    fromStatusCodeId: codes.RSV,
    toStatusCodeId: codes.FPO,
    message: "A serial on this pull-out is not reserved",
  });
  await claimScPulloutHeader(tx, {
    id: pulloutId,
    tenantId: actor.tenantId,
    fromStatusCodeIds: [pendingId],
    toStatusCodeId: nextStatusId,
  });
  await tx.serviceCenterPulloutDetail.updateMany({
    where: { pulloutId, decision: PULLOUT_LINE_DECISION.pending },
    data: { decision: PULLOUT_LINE_DECISION.accepted, decidedAt: new Date(), decidedById: actor.userId },
  });
  await stampApproval(tx, pulloutId, actor.userId, "approved");
  await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh), {
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
    serialNumberIds: moved,
    status: "FPO",
    details: `Approved on ${fresh.pulloutNo}`,
  });
  await audit(tx, actor, pulloutId, "pullout.approved", { pulloutNo: fresh.pulloutNo });
}

export const scPulloutPostingService = {
  /** STK and DEF units at any location of the center that no open pull-out holds. */
  async listSerials(actor: PostingActor, serviceCenterId: string): Promise<PulloutSerialOption[]> {
    await authorizeScPullout(actor, "create", serviceCenterId);
    const codes = await pulloutInventoryIds(actor.tenantId);
    const rows = await prisma.serviceCenterInventory.findMany({
      where: {
        tenantId: actor.tenantId,
        serviceCenterId,
        statusCodeId: { in: [codes.STK, codes.DEF] },
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
      openPulloutIdsBySerial(prisma, actor.tenantId, serialIds),
      recordedProblemsBySerial(actor.tenantId, serialIds),
    ]);
    return rows.flatMap((row) => {
      if ((openDocs.get(row.serialNumberId) ?? []).length > 0) return [];
      const code = asHoldCode(row.statusCode?.code);
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
    const scope = await resolveScIdsForUser(actor.tenantId, actor.userId, actor.permissions);
    const pullout = await prisma.serviceCenterPullout.findFirst({
      where: {
        id: pulloutId,
        tenantId: actor.tenantId,
        ...(scope ? { serviceCenterId: { in: scope } } : {}),
      },
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
        serviceCenter: { select: { id: true, name: true } },
        statusCode: { select: { code: true, name: true, color: true } },
        reasonStatusCode: { select: { id: true, code: true, name: true, color: true } },
        attachments: { select: { id: true, fileName: true }, orderBy: { createdAt: "asc" } },
        details: {
          select: {
            ...PULLOUT_LINE_CHECKLIST_SELECT,
            sapDocType: true,
            sapDocNum: true,
            sapDocDate: true,
            sapDocLinkedAt: true,
            sapDocLinkedBy: { select: { name: true } },
            redeliveryDelivery: {
              select: { id: true, deliveryNo: true, sapDocNo: true, serviceCenter: { select: { name: true } } },
            },
          },
          orderBy: { serialNumber: { serialNo: "asc" } },
        },
      },
    });
    if (!pullout?.statusCode) throw new Error(NOT_FOUND);
    const serialIds = pullout.details.map((line) => line.serialNumberId);
    const [inventory, history] = await Promise.all([
      serialIds.length
        ? prisma.serviceCenterInventory.findMany({
            where: {
              tenantId: actor.tenantId,
              serviceCenterId: pullout.serviceCenter.id,
              serialNumberId: { in: serialIds },
            },
            select: { serialNumberId: true, statusCode: { select: { code: true } } },
          })
        : [],
      prisma.auditLog.findMany({
        where: { tenantId: actor.tenantId, entityType: ENTITY_TYPE, entityId: pullout.id },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, action: true, createdAt: true, user: { select: { name: true } } },
      }),
    ]);
    const inventoryBySerial = new Map(inventory.map((row) => [row.serialNumberId, row]));
    return {
      id: pullout.id,
      pulloutNo: pullout.pulloutNo,
      condition: pulloutCondition(
        pullout.details.map((line) => ({ priorCode: line.priorStatusCode?.code ?? null })),
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
      place: pullout.serviceCenter,
      warehouse: null,
      warehouseLocation: null,
      reason: pullout.reasonStatusCode,
      lines: pullout.details.map((line) => ({
        ...pulloutLineChecklistView(
          line,
          inventoryBySerial.get(line.serialNumberId)?.statusCode?.code ?? null,
        ),
        receivedAt: null,
        receivedByName: null,
        receivedLocation: null,
        rejectedAt: null,
        rejectedByName: null,
        rejectionRemarks: null,
        sapDocument: pulloutLineSapDocumentView(line),
        redelivery: line.redeliveryDelivery
          ? {
              deliveryId: line.redeliveryDelivery.id,
              deliveryNo: line.redeliveryDelivery.deliveryNo,
              drNo: line.redeliveryDelivery.sapDocNo,
              placeName: line.redeliveryDelivery.serviceCenter.name,
            }
          : null,
      })),
      canCheckSap: (PULLOUT_SETTLED_CODES as readonly string[]).includes(pullout.statusCode.code),
      history: history.map((row) => ({
        id: row.id,
        action: row.action,
        at: row.createdAt.toISOString(),
        userName: row.user?.name || null,
      })),
    };
  },

  async create(actor: PostingActor, input: ScPulloutCreateInput) {
    await authorizeScPullout(actor, "create", input.serviceCenterId);
    const checklist = checklistBySerial(input.lines);
    const problemNames = await assertActiveChecklist(actor.tenantId, input.lines);

    const serials = await loadAllocatable(actor.tenantId, input.serviceCenterId, [...checklist.keys()]);
    const plan = planPulloutCreate({ branchId: input.serviceCenterId, serials });
    if (!plan.ok) throw new Error(plan.error);
    assertLineDetails(plan.lines, checklist);
    const [codes, statusCodeId, defectiveReasonId] = await Promise.all([
      pulloutInventoryIds(actor.tenantId),
      pulloutWorkflowId(actor.tenantId, "pending_tl"),
      defectiveReasonIdFor(actor.tenantId, plan.lines),
    ]);

    try {
      return await prisma.$transaction(async (tx) => {
        const serialIds = plan.lines.map((line) => line.serialNumberId);
        await lockSerialsThenScRows(tx, actor.tenantId, input.serviceCenterId, serialIds);
        await assertSerialsNotFrozenInStockCount(actor.tenantId, serialIds);
        await assertNotOnOtherPullout(tx, actor.tenantId, serialIds);
        const reserved = plan.lines.filter((line) => line.nextCode === "RSV").map((line) => line.serialNumberId);
        await claimScInventory(tx, {
          tenantId: actor.tenantId,
          serviceCenterId: input.serviceCenterId,
          serialNumberIds: reserved,
          fromStatusCodeId: codes.STK,
          toStatusCodeId: codes.RSV,
          message: CLAIM_LOST,
        });

        const row = await tx.serviceCenterPullout.create({
          data: {
            tenantId: actor.tenantId,
            serviceCenterId: input.serviceCenterId,
            pulloutNo: nextNo(),
            statusCodeId,
            notes: input.notes?.trim() || null,
            createdById: actor.userId,
            details: {
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
        await inventoryApprovalLedger.recordRequested(tx, approvalDocument(actor.tenantId, row), {
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
        await audit(tx, actor, row.id, "pullout.created", {
          pulloutNo: row.pulloutNo,
          condition: pulloutCondition(plan.lines),
          serialCount: plan.lines.length,
        });
        return row;
      });
    } catch (error) {
      throw postingError(error, "Failed to create pull-out");
    }
  },

  async approve(actor: PostingActor, pulloutId: string) {
    await authorizeScPullout(actor, "approve", null);
    const current = await requirePullout(prisma, actor.tenantId, pulloutId);
    const preview = planPulloutApprove(current);
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) return { id: current.id };
    const ids = await approvalIds(actor.tenantId);
    try {
      await prisma.$transaction((tx) => approveInTx(tx, actor, pulloutId, ids));
    } catch (error) {
      throw postingError(error, "Failed to approve pull-out");
    }
    return { id: current.id };
  },

  async approveLine(actor: PostingActor, pulloutId: string, serialNumberId: string) {
    await authorizeScPullout(actor, "approve", null);
    const current = await requirePullout(prisma, actor.tenantId, pulloutId);
    const preview = planPulloutLineApprove({ ...current, serialNumberId });
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) return { id: current.id };
    const ids = await approvalIds(actor.tenantId);

    try {
      await prisma.$transaction(async (tx) => {
        // Line actions lock every serial, so two decisions on one pull-out run in turn
        // and the last one always sees that nothing else is pending.
        await lockSerialNumbers(tx, current.lines.map((line) => line.serialNumberId));
        const fresh = await requirePullout(tx, actor.tenantId, pulloutId);
        const plan = planPulloutLineApprove({ ...fresh, serialNumberId });
        if (!plan.ok) throw new Error(plan.error);
        if (plan.idempotent) return;
        await tx.serviceCenterPulloutDetail.updateMany({
          where: { pulloutId, serialNumberId },
          data: { decision: PULLOUT_LINE_DECISION.accepted, decidedAt: new Date(), decidedById: actor.userId },
        });
        await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh), {
          serialNumberIds: [serialNumberId],
          status: "APPROVED",
          decidedById: actor.userId,
        });
        await audit(tx, actor, pulloutId, "pullout.line_approved", {
          pulloutNo: fresh.pulloutNo,
          serialNo: serialNoOf(fresh, serialNumberId) ?? null,
        });
        if (plan.completesApproval) await approveInTx(tx, actor, pulloutId, ids);
      });
    } catch (error) {
      throw postingError(error, "Failed to approve this unit");
    }
    return { id: current.id };
  },

  async deleteLine(actor: PostingActor, pulloutId: string, serialNumberId: string) {
    await authorizeScPullout(actor, "reject", null);
    const current = await requirePullout(prisma, actor.tenantId, pulloutId);
    const preview = planPulloutLineDelete({ ...current, serialNumberId });
    if (!preview.ok) throw new Error(preview.error);
    const ids = await approvalIds(actor.tenantId);

    try {
      await prisma.$transaction(async (tx) => {
        await lockSerialNumbers(tx, current.lines.map((line) => line.serialNumberId));
        const fresh = await requirePullout(tx, actor.tenantId, pulloutId);
        const plan = planPulloutLineDelete({ ...fresh, serialNumberId });
        if (!plan.ok) throw new Error(plan.error);
        if (plan.restore) {
          await claimScInventory(tx, {
            tenantId: actor.tenantId,
            serviceCenterId: fresh.serviceCenterId,
            serialNumberIds: [plan.restore.serialNumberId],
            fromStatusCodeId: ids.codes.RSV,
            toStatusCodeId: ids.codes[plan.restore.restoreCode],
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
        await tx.serviceCenterPulloutDetail.deleteMany({ where: { pulloutId, serialNumberId } });
        await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh), {
          serialNumberIds: [serialNumberId],
          status: "REJECTED",
          decidedById: actor.userId,
        });
        await audit(tx, actor, pulloutId, "pullout.line_deleted", {
          pulloutNo: fresh.pulloutNo,
          serialNo: serialNoOf(fresh, serialNumberId) ?? null,
        });
        if (plan.completesApproval) await approveInTx(tx, actor, pulloutId, ids);
      });
    } catch (error) {
      throw postingError(error, "Failed to delete this unit");
    }
    return { id: current.id };
  },

  async reject(actor: PostingActor, pulloutId: string) {
    await authorizeScPullout(actor, "reject", null);
    const current = await requirePullout(prisma, actor.tenantId, pulloutId);
    const preview = planPulloutReject(current);
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) return { id: current.id };

    const [codes, nextStatusId, fromIds] = await Promise.all([
      pulloutInventoryIds(actor.tenantId),
      pulloutWorkflowId(actor.tenantId, "cancelled"),
      Promise.all(
        (["pending_tl", "requested"] as const).map((code) => pulloutWorkflowId(actor.tenantId, code)),
      ),
    ]);

    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await requirePullout(tx, actor.tenantId, pulloutId);
        const plan = planPulloutReject(fresh);
        if (!plan.ok) throw new Error(plan.error);
        if (plan.idempotent) return;
        await lockSerialNumbers(tx, plan.restores.map((row) => row.serialNumberId));
        for (const prior of ["STK", "DEF"] as const) {
          const restored = plan.restores
            .filter((row) => row.restoreCode === prior)
            .map((row) => row.serialNumberId);
          await claimScInventory(tx, {
            tenantId: actor.tenantId,
            serviceCenterId: fresh.serviceCenterId,
            serialNumberIds: restored,
            fromStatusCodeId: codes.RSV,
            toStatusCodeId: codes[prior],
            message: "A reserved serial on this pull-out could not be restored",
          });
          await writePulloutHistory(tx, {
            tenantId: actor.tenantId,
            userId: actor.userId,
            pulloutNo: fresh.pulloutNo,
            serialNumberIds: restored,
            status: prior,
            details: `Hold released on ${fresh.pulloutNo}`,
          });
        }
        await claimScPulloutHeader(tx, {
          id: pulloutId,
          tenantId: actor.tenantId,
          fromStatusCodeIds: fromIds,
          toStatusCodeId: nextStatusId,
        });
        await stampApproval(tx, pulloutId, actor.userId, "rejected");
        await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh), {
          serialNumberIds: fresh.lines.map((line) => line.serialNumberId),
          status: "REJECTED",
          decidedById: actor.userId,
        });
        await audit(tx, actor, pulloutId, "pullout.rejected", {
          pulloutNo: fresh.pulloutNo,
          restoredSerialIds: plan.restores.map((row) => row.serialNumberId),
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to reject pull-out");
    }
    return { id: current.id };
  },

  /**
   * Cancels a pull-out after Team Lead approval, as for branch pull-outs (rules in
   * `lib/pullout-cancel.ts`): SAP first (Returns closed, ITs cancelled), then units back to
   * STK/DEF except those on a Return, and the header Cancelled, in one transaction.
   */
  async cancel(actor: PostingActor, pulloutId: string) {
    const current = await requirePullout(prisma, actor.tenantId, pulloutId);
    await authorizeScPullout(actor, "cancel", current.serviceCenterId);
    if (current.status === "cancelled") return { id: current.id, sapDone: [] as string[] };
    if (!current.statusCodeId) throw new Error(UPDATED_ELSEWHERE);
    const fromStatusId = current.statusCodeId;

    const { plan, sapDone } = await settlePulloutCancelInSap(actor.tenantId, {
      id: current.id,
      pulloutNo: current.pulloutNo,
      status: current.status,
      lines: current.lines,
    });

    const [codes, pulledOutId, cancelledId] = await Promise.all([
      pulloutInventoryIds(actor.tenantId),
      reasonStatusService.requireCodeId(actor.tenantId, "inventory_system", "PO"),
      pulloutWorkflowId(actor.tenantId, "cancelled"),
    ]);
    const codeIds: Record<string, string> = { ...codes, PO: pulledOutId };
    const details = pulloutCancelHistoryText(current.pulloutNo, sapDone);

    try {
      await prisma.$transaction(async (tx) => {
        await lockSerialsThenScRows(
          tx,
          actor.tenantId,
          current.serviceCenterId,
          plan.restores.map((row) => row.serialNumberId),
        );
        for (const group of groupRestores(plan.restores)) {
          const fromId = codeIds[group.fromCode];
          if (!fromId) throw new Error(`Status code not configured: inventory_system/${group.fromCode}`);
          await claimScInventory(tx, {
            tenantId: actor.tenantId,
            serviceCenterId: current.serviceCenterId,
            serialNumberIds: group.serialNumberIds,
            fromStatusCodeId: fromId,
            toStatusCodeId: codeIds[group.restoreCode],
            message: "A serial on this pull-out changed. Reload and try again.",
          });
          await writePulloutHistory(tx, {
            tenantId: actor.tenantId,
            userId: actor.userId,
            pulloutNo: current.pulloutNo,
            serialNumberIds: group.serialNumberIds,
            status: group.restoreCode,
            details,
          });
        }
        await writePulloutHistory(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          pulloutNo: current.pulloutNo,
          serialNumberIds: plan.keptPulledOutIds,
          status: null,
          details,
        });
        await claimScPulloutHeader(tx, {
          id: current.id,
          tenantId: actor.tenantId,
          fromStatusCodeIds: [fromStatusId],
          toStatusCodeId: cancelledId,
        });
        await audit(tx, actor, current.id, "pullout.cancelled", {
          pulloutNo: current.pulloutNo,
          from: current.status,
          restoredSerialIds: plan.restores.map((row) => row.serialNumberId),
          keptPulledOutSerialIds: plan.keptPulledOutIds,
          sapDone,
        });
      });
    } catch (error) {
      const failure = postingError(error, "Failed to cancel the pull-out");
      if (sapDone.length === 0) throw failure;
      throw new Error(`${sapDone.join(", ")} in SAP, but ISMS could not save the cancel (${failure.message}). Try again.`);
    }
    return { id: current.id, sapDone };
  },

  async addAttachment(actor: PostingActor, pulloutId: string, file: File) {
    const pullout = await prisma.serviceCenterPullout.findFirst({
      where: { id: pulloutId, tenantId: actor.tenantId },
      select: {
        pulloutNo: true,
        serviceCenterId: true,
        statusCode: { select: { code: true } },
        _count: { select: { attachments: true } },
      },
    });
    if (!pullout) throw new Error(NOT_FOUND);
    await authorizeScPullout(actor, "create", pullout.serviceCenterId);
    if (!pullout.statusCode || !PULLOUT_ATTACHMENT_OPEN_CODES.includes(pullout.statusCode.code)) {
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
        await tx.serviceCenterPulloutAttachment.create({
          data: {
            pulloutId,
            fileName: file.name,
            storagePath,
            mimeType: file.type,
            sizeBytes: file.size,
            uploadedById: actor.userId,
          },
        });
        await audit(tx, actor, pulloutId, "pullout.attachment_added", {
          pulloutNo: pullout.pulloutNo,
          fileName: file.name,
        });
      });
    } catch (error) {
      // A file with no row can never be found again, so do not leave it behind.
      await storage.remove(storagePath).catch(() => undefined);
      throw postingError(error, "Failed to attach the file");
    }
  },

  async getAttachment(tenantId: string, attachmentId: string) {
    return prisma.serviceCenterPulloutAttachment.findFirst({
      where: { id: attachmentId, pullout: { tenantId } },
      select: { fileName: true, storagePath: true, mimeType: true },
    });
  },

  async updateList(actor: PostingActor, input: ScPulloutListInput) {
    const current = await requirePullout(prisma, actor.tenantId, input.pulloutId);
    await authorizeScPullout(actor, "updateList", current.serviceCenterId);

    const nextIds = input.serialNumberIds ?? current.lines.map((line) => line.serialNumberId);
    const nextSet = new Set(nextIds);
    const currentIds = new Set(current.lines.map((line) => line.serialNumberId));
    const addedIds = nextIds.filter((id) => !currentIds.has(id));
    const added = await loadAllocatable(actor.tenantId, current.serviceCenterId, addedIds, current.id);
    const plan = planPulloutUpdateList({
      status: current.status,
      kept: current.lines.filter((line) => nextSet.has(line.serialNumberId)),
      removed: current.lines.filter((line) => !nextSet.has(line.serialNumberId)),
      added,
    });
    if (!plan.ok) throw new Error(plan.error);
    const addedLines = plan.holds.length > 0 ? (input.addedLines ?? []) : [];
    const addedDetails = plan.holds.length > 0 ? checklistBySerial(addedLines) : new Map();
    assertLineDetails(plan.holds, addedDetails);
    await assertActiveChecklist(actor.tenantId, addedLines);

    const [defectiveReasonId, codes, nextStatusId, fromIds] = await Promise.all([
      defectiveReasonIdFor(actor.tenantId, plan.holds),
      pulloutInventoryIds(actor.tenantId),
      pulloutWorkflowId(actor.tenantId, "pending_logistics"),
      Promise.all(
        (["for_pullout", "pending_logistics"] as const).map((code) =>
          pulloutWorkflowId(actor.tenantId, code),
        ),
      ),
    ]);

    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await requirePullout(tx, actor.tenantId, input.pulloutId);
        const freshIds = new Set(fresh.lines.map((line) => line.serialNumberId));
        const freshRemoved = fresh.lines.filter((line) => !nextSet.has(line.serialNumberId));
        const freshPlan = planPulloutUpdateList({
          status: fresh.status,
          kept: fresh.lines.filter((line) => nextSet.has(line.serialNumberId)),
          removed: freshRemoved,
          added: added.filter((serial) => !freshIds.has(serial.serialNumberId)),
        });
        if (!freshPlan.ok) throw new Error(freshPlan.error);

        const holdIds = freshPlan.holds.map((hold) => hold.serialNumberId);
        const touchedIds = [...freshPlan.restores.map((row) => row.serialNumberId), ...holdIds];
        await lockSerialsThenScRows(tx, actor.tenantId, fresh.serviceCenterId, touchedIds);
        await assertSerialsNotFrozenInStockCount(actor.tenantId, touchedIds);
        await assertNotOnOtherPullout(tx, actor.tenantId, holdIds, fresh.id);

        for (const prior of ["STK", "DEF"] as const) {
          await claimScInventory(tx, {
            tenantId: actor.tenantId,
            serviceCenterId: fresh.serviceCenterId,
            serialNumberIds: freshPlan.restores
              .filter((row) => row.restoreCode === prior)
              .map((row) => row.serialNumberId),
            fromStatusCodeId: prior === "DEF" ? codes.DEF : codes.FPO,
            toStatusCodeId: codes[prior],
            message: "A removed serial is not held by this pull-out",
          });
        }

        const stockHolds = freshPlan.holds.filter((hold) => hold.nextCode === "FPO");
        await claimScInventory(tx, {
          tenantId: actor.tenantId,
          serviceCenterId: fresh.serviceCenterId,
          serialNumberIds: stockHolds.map((hold) => hold.serialNumberId),
          fromStatusCodeId: codes.STK,
          toStatusCodeId: codes.FPO,
          message: CLAIM_LOST,
        });

        if (freshRemoved.length > 0) {
          await tx.serviceCenterPulloutDetail.deleteMany({
            where: {
              pulloutId: fresh.id,
              serialNumberId: { in: freshRemoved.map((line) => line.serialNumberId) },
            },
          });
        }
        // Nested details need one create each. Kept lines are not rewritten.
        for (const hold of freshPlan.holds) {
          await tx.serviceCenterPulloutDetail.create({
            data: {
              pulloutId: fresh.id,
              serialNumberId: hold.serialNumberId,
              priorStatusCodeId: codes[hold.priorCode],
              ...lineDetailData(hold, addedDetails, defectiveReasonId),
            },
          });
        }

        await claimScPulloutHeader(tx, {
          id: fresh.id,
          tenantId: actor.tenantId,
          fromStatusCodeIds: fromIds,
          toStatusCodeId: nextStatusId,
        });
        await tx.serviceCenterPullout.update({
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
              : { scheduledAt: input.scheduledAt, scheduledById: input.scheduledAt ? actor.userId : null }),
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
        await audit(tx, actor, fresh.id, "pullout.list_saved", {
          pulloutNo: fresh.pulloutNo,
          serialCount: nextIds.length,
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to save the pull-out list");
    }
    return { id: current.id };
  },

  /** Send: FPO and DEF units go DIT and the pull-out ends In transit. */
  async finalize(actor: PostingActor, pulloutId: string) {
    const current = await requirePullout(prisma, actor.tenantId, pulloutId);
    await authorizeScPullout(actor, "finalize", current.serviceCenterId);
    const preview = planPulloutFinalize(current);
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) return { id: current.id };

    const [codes, nextStatusId, pendingLogisticsId] = await Promise.all([
      pulloutInventoryIds(actor.tenantId),
      pulloutWorkflowId(actor.tenantId, "in_transit"),
      pulloutWorkflowId(actor.tenantId, "pending_logistics"),
    ]);

    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await requirePullout(tx, actor.tenantId, pulloutId);
        const plan = planPulloutFinalize(fresh);
        if (!plan.ok) throw new Error(plan.error);
        if (plan.idempotent) return;
        const moved = plan.moves.map((move) => move.serialNumberId);
        await lockSerialNumbers(tx, moved);
        await assertSerialsNotFrozenInStockCount(actor.tenantId, moved);
        for (const fromCode of ["FPO", "DEF"] as const) {
          await claimScInventory(tx, {
            tenantId: actor.tenantId,
            serviceCenterId: fresh.serviceCenterId,
            serialNumberIds: fresh.lines
              .filter((line) => line.inventoryCode === fromCode)
              .map((line) => line.serialNumberId),
            fromStatusCodeId: codes[fromCode],
            toStatusCodeId: codes.DIT,
            message: "Some serials are not ready to leave the service center",
          });
        }
        await claimScPulloutHeader(tx, {
          id: pulloutId,
          tenantId: actor.tenantId,
          fromStatusCodeIds: [pendingLogisticsId],
          toStatusCodeId: nextStatusId,
        });
        await writePulloutHistory(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          pulloutNo: fresh.pulloutNo,
          serialNumberIds: moved,
          status: "DIT",
          details: `In transit on ${fresh.pulloutNo}`,
        });
        await audit(tx, actor, pulloutId, "pullout.finalized", {
          pulloutNo: fresh.pulloutNo,
          serialCount: moved.length,
          status: "in_transit",
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to send the pull-out");
    }
    return { id: current.id };
  },
};
