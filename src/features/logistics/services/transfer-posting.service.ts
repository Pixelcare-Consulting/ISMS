
import {
  inventoryApprovalLedger,
  type InventoryApprovalDocument,
} from "@/features/inventory-approvals/services/inventory-approval-ledger";
import { aorRepository } from "@/features/aors/repositories/aor.repository";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { notificationService } from "@/features/notifications/services/notification.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  DIFFERENT_DEALER_GROUP_MESSAGE,
  sameDealerGroup,
  transferSlipNumbers,
} from "@/features/logistics/lib/transfer-dealer-group";
import {
  resolveLogisticsBranchScope,
  transferIsVisible,
} from "@/features/logistics/lib/transfer-visibility";
import {
  transferLineRemark,
  type TransferLineRemarks,
} from "@/features/logistics/lib/transfer-line-remarks";
import { nextTransferNo } from "@/features/logistics/lib/transfer-number";
import {
  canApproveTransferAt,
  NOT_TRANSFER_APPROVER_MESSAGE,
  transferApprovalBranchIds,
} from "@/features/logistics/lib/transfer-approver";
import { transferDecisionPrefix } from "@/features/serial-activity/lib/transfer-reference";
import { resolveLogisticsCapabilities } from "@/features/logistics/constants/logistics-permissions";
import {
  asWorkflowCode,
  TRANSFER_WORKFLOW_CODE,
  type TransferWorkflowCodeKey,
} from "@/features/logistics/constants/workflow-codes";
import type { AllocatableSerial } from "@/features/logistics/services/posting-planner-types";
import {
  asHoldCode,
  asInventoryCode,
  assertMovable,
  authorizeBranchScope,
  authorizePosting,
  claimHeader,
  claimInventory,
  lockSerialsThenInventoryRows,
  openDocumentIdsBySerial,
  postingError,
  type PostingActor,
  type PostingDb,
} from "@/features/logistics/services/posting-support";
import {
  lineAwaitsReceipt,
  planTransferApprove,
  planTransferCreate,
  planTransferReceive,
  planTransferReject,
  planTransferRelease,
  planTransferSerialReject,
  type TransferHeaderAfterLines,
  type TransferLineView,
  type TransferReceivePlan,
  type TransferStatus,
} from "@/features/logistics/services/transfer-posting.planner";
import { TEAM_LEADER_ROLE_SLUG } from "@/features/orders/constants/order-workflow";
import { STOCK_COUNT_FREEZE_SESSION_STATUSES } from "@/features/stock-audit/constants/stock-count-workflow";
import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma/client";
import { logger } from "@/lib/shared/logger";

const CLAIM_LOST = "One or more serials changed before this transfer could be saved";

/** An inventory_system code with its Settings → Status label and color. */
export interface TransferInventoryStatus {
  code: string;
  name: string;
  color: string | null;
}

export interface TransferSerialOption {
  serialNumberId: string;
  serialNo: string;
  modelId: string;
  skuCode: string;
  modelName: string;
  inventoryCode: "STK" | "DEF";
  inventoryStatus: TransferInventoryStatus;
}

export interface TransferDetail {
  id: string;
  transferNo: string;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  status: { code: string; name: string; color: string | null };
  rsNo: string | null;
  drNo: string | null;
  fromBranch: { id: string; name: string };
  toBranch: { id: string; name: string };
  model: { id: string; skuCode: string; name: string } | null;
  lines: {
    serialNumberId: string;
    serialNo: string;
    skuCode: string;
    modelName: string;
    quantity: number;
    priorCode: string | null;
    inventoryCode: string | null;
    /** Null when the unit is no longer at the releasing or receiving branch. */
    inventoryStatus: TransferInventoryStatus | null;
    branchId: string | null;
    branchName: string | null;
    decision: "pending" | "accepted" | "rejected";
    /** Released and waiting for the receiving branch to accept or reject it. */
    awaitingReceipt: boolean;
    remarks: string | null;
    requestRemarks: string | null;
  }[];
  history: { id: string; action: string; at: string; userName: string | null }[];
}

function creatorName(user: { name: string; email: string } | null): string | null {
  if (!user) return null;
  const name = user.name.trim();
  if (name) return name;
  const email = user.email.trim();
  return email || null;
}

function asTransferStatus(code: string): TransferStatus | null {
  return asWorkflowCode(TRANSFER_WORKFLOW_CODE, code);
}

function asLineDecision(value: string): "pending" | "accepted" | "rejected" {
  switch (value) {
    case "accepted":
    case "rejected":
    case "pending":
      return value;
    default:
      return "pending";
  }
}

async function assertSameDealerGroup(
  tenantId: string,
  fromBranchId: string,
  toBranchId: string,
): Promise<void> {
  const rows = await prisma.branch.findMany({
    where: { tenantId, id: { in: [fromBranchId, toBranchId] }, deletedAt: null },
    select: { id: true, dealerId: true },
  });
  const from = rows.find((row) => row.id === fromBranchId);
  const to = rows.find((row) => row.id === toBranchId);
  if (!from || !to) throw new Error("Choose the releasing and receiving branches");
  if (!sameDealerGroup(from.dealerId, to.dealerId)) {
    throw new Error(DIFFERENT_DEALER_GROUP_MESSAGE);
  }
}

async function assertTransferVisible(
  actor: PostingActor,
  transfer: { fromBranchId: string; toBranchId: string; status: string },
): Promise<void> {
  const scope = await resolveLogisticsBranchScope(actor);
  if (
    !transferIsVisible(scope, {
      fromBranchId: transfer.fromBranchId,
      toBranchId: transfer.toBranchId,
      statusCode: transfer.status,
    })
  ) {
    throw new Error("Transfer not found");
  }
}

async function assertTransferApprover(actor: PostingActor, fromBranchId: string): Promise<void> {
  const assignedBranchIds = await getUserBranchIds(actor.tenantId, actor.userId);
  const approvalBranchIds = transferApprovalBranchIds(actor.roleSlugs, assignedBranchIds);
  if (!canApproveTransferAt(approvalBranchIds, fromBranchId)) {
    throw new Error(NOT_TRANSFER_APPROVER_MESSAGE);
  }
}

/** Tells the releasing branch's team leaders. The transfer is already saved, so a failure only logs. */
async function notifyTransferApprovers(
  actor: PostingActor,
  transfer: { id: string; transferNo: string; fromBranchId: string; toBranchId: string },
): Promise<void> {
  try {
    const approverIds = await aorRepository.listUserIdsForBranchByRole(
      actor.tenantId,
      transfer.fromBranchId,
      TEAM_LEADER_ROLE_SLUG,
    );
    const recipients = approverIds.filter((userId) => userId !== actor.userId);
    if (recipients.length === 0) return;

    const branches = await prisma.branch.findMany({
      where: { tenantId: actor.tenantId, id: { in: [transfer.fromBranchId, transfer.toBranchId] } },
      select: { id: true, name: true },
    });
    const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name ?? "branch";

    await Promise.all(
      recipients.map((userId) =>
        notificationService.createNotification({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          data: {
            audience: "USER",
            userId,
            type: "transfer",
            title: `${transfer.transferNo} · ${branchName(transfer.fromBranchId)}`,
            body: `Transfer to ${branchName(transfer.toBranchId)} needs your approval.`,
            href: `/logistics/transfers/${transfer.id}`,
            metadata: { transferId: transfer.id },
          },
        }),
      ),
    );
  } catch (error) {
    logger.warn(
      { tenantId: actor.tenantId, transferId: transfer.id, err: error },
      "transfer approval notification failed",
    );
  }
}

function canDecideReceivingSerials(actor: PostingActor): boolean {
  const caps = resolveLogisticsCapabilities(actor.permissions);
  return caps.canReceiveTransfer || caps.canApproveTl;
}

const MOVEMENT_DATE = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "Asia/Manila",
});

function movementDetails(input: {
  decision: "accepted" | "rejected";
  transferNo: string;
  approvedAt: Date | null;
  approvedBy: string | null;
  remarks: string | null;
  rsNo: string;
  drNo: string;
}): string {
  const when = input.approvedAt ? MOVEMENT_DATE.format(input.approvedAt) : "—";
  const remarks = input.remarks?.trim() || "—";
  return `${transferDecisionPrefix(input.decision, input.transferNo)} Approval date ${when}. Approved by ${input.approvedBy ?? "—"}. Remarks: ${remarks}. RS ${input.rsNo}. DR ${input.drNo}.`;
}

function isTransferNoConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  const parts = Array.isArray(target)
    ? target.map((part) => String(part))
    : typeof target === "string"
      ? [target]
      : [];
  return parts.join(" ").toLowerCase().replace(/_/g, "").includes("transferno");
}

function freshTransferNo(previous?: string): string {
  const generated = nextTransferNo();
  if (!previous || generated !== previous) return generated;
  return `XFR-${(Date.now() + 1).toString(36).toUpperCase()}`;
}

async function inventoryIds(tenantId: string) {
  const [stk, def, rsv, dit, ftr] = await Promise.all([
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "STK"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "DEF"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "RSV"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "DIT"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "FTR"),
  ]);
  return { STK: stk, DEF: def, RSV: rsv, DIT: dit, FTR: ftr };
}

async function workflowId(tenantId: string, code: TransferWorkflowCodeKey) {
  return reasonStatusService.requireCodeId(tenantId, "transfer_workflow", code);
}

async function rejectStatusId(tenantId: string) {
  const rejected = await prisma.reasonStatusCode.findFirst({
    where: {
      tenantId,
      code: TRANSFER_WORKFLOW_CODE.rejected,
      reasonStatus: { category: "transfer_workflow" },
    },
    select: { id: true },
  });
  if (rejected) return rejected.id;
  return workflowId(tenantId, TRANSFER_WORKFLOW_CODE.cancelled);
}

async function loadAllocatable(
  tenantId: string,
  branchId: string,
  serialNumberIds: string[],
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
    openDocumentIdsBySerial(tenantId, unique),
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

async function loadLines(
  db: PostingDb | typeof prisma,
  tenantId: string,
  transferId: string,
): Promise<{
  id: string;
  transferNo: string;
  fromBranchId: string;
  toBranchId: string;
  status: TransferStatus;
  statusCodeId: string;
  rsNo: string | null;
  drNo: string | null;
  lines: (TransferLineView & { priorStatusCodeId: string | null })[];
} | null> {
  const transfer = await db.branchTransfer.findFirst({
    where: { id: transferId, tenantId },
    select: {
      id: true,
      transferNo: true,
      fromBranchId: true,
      toBranchId: true,
      statusCodeId: true,
      statusCode: { select: { code: true } },
      rsNo: true,
      drNo: true,
      lines: {
        select: {
          serialNumberId: true,
          priorStatusCodeId: true,
          decision: true,
          priorStatusCode: { select: { code: true } },
        },
      },
    },
  });
  if (!transfer) return null;
  const status = asTransferStatus(transfer.statusCode.code);
  if (!status) return null;
  const serialIds = transfer.lines.map((line) => line.serialNumberId);
  const inventory = serialIds.length
    ? await db.branchInventory.findMany({
        where: { tenantId, serialNumberId: { in: serialIds } },
        select: {
          serialNumberId: true,
          branchId: true,
          statusCode: { select: { code: true } },
        },
      })
    : [];
  const inventoryBySerial = new Map(inventory.map((row) => [row.serialNumberId, row]));
  return {
    id: transfer.id,
    transferNo: transfer.transferNo,
    fromBranchId: transfer.fromBranchId,
    toBranchId: transfer.toBranchId,
    status,
    statusCodeId: transfer.statusCodeId,
    rsNo: transfer.rsNo,
    drNo: transfer.drNo,
    lines: transfer.lines.map((line) => {
      const row = inventoryBySerial.get(line.serialNumberId);
      const onSource = row?.branchId === transfer.fromBranchId;
      const onDest = row?.branchId === transfer.toBranchId;
      return {
        serialNumberId: line.serialNumberId,
        priorCode: asHoldCode(line.priorStatusCode?.code),
        priorStatusCodeId: line.priorStatusCodeId,
        decision: asLineDecision(line.decision),
        inventoryCode: onSource || onDest ? asInventoryCode(row?.statusCode.code) : null,
        branchId: onSource || onDest ? (row?.branchId ?? null) : null,
      };
    }),
  };
}

async function writeHistory(
  tx: PostingDb,
  input: {
    tenantId: string;
    userId: string;
    transferNo: string;
    serialNumberIds: string[];
    status: string;
    details: string;
  },
) {
  if (input.serialNumberIds.length === 0) return;
  await tx.serialNumberHistory.createMany({
    data: input.serialNumberIds.map((serialNumberId) => ({
      tenantId: input.tenantId,
      serialNumberId,
      txnType: "transfer" as const,
      details: input.details,
      status: input.status,
      createdById: input.userId,
    })),
  });
}

function approvalDocument(
  tenantId: string,
  transfer: { id: string; transferNo: string },
  step: "TL_APPROVAL" | "RECEIVING",
): InventoryApprovalDocument {
  return { tenantId, sourceType: "TRANSFER", sourceId: transfer.id, sourceNo: transfer.transferNo, step };
}

async function stampApproval(
  tx: PostingDb,
  transferId: string,
  userId: string,
  decision: "approved" | "rejected",
) {
  const existing = await tx.branchTransferApprovalLevel.findFirst({
    where: { transferId, level: 1 },
    select: { id: true },
  });
  const data =
    decision === "approved"
      ? { approvedAt: new Date(), approvedById: userId, rejectedAt: null, rejectedById: null }
      : { rejectedAt: new Date(), rejectedById: userId, approvedAt: null, approvedById: null };
  if (!existing) {
    await tx.branchTransferApprovalLevel.create({
      data: { transferId, level: 1, roleSlug: "tl", ...data },
    });
    return;
  }
  await tx.branchTransferApprovalLevel.update({ where: { id: existing.id }, data });
}

type SerialDecision =
  | { kind: "accept"; serialNumberIds: string[] }
  | { kind: "reject"; serialNumberId: string; remarks: string };

async function workflowForHeader(tenantId: string, status: TransferHeaderAfterLines): Promise<string> {
  switch (status) {
    case "rejected":
      return rejectStatusId(tenantId);
    case "in_transit":
    case "accepted":
    case "completed":
      return workflowId(tenantId, status);
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

type DecisionMove = TransferReceivePlan["moves"][number];
type DecisionGroup = Pick<DecisionMove, "fromCode" | "atBranchId"> & { serialNumberIds: string[] };

/** One claim per hold and current branch, since claimInventory filters on both. */
function groupMovesByHold(moves: readonly DecisionMove[]): DecisionGroup[] {
  const groups = new Map<string, DecisionGroup>();
  for (const move of moves) {
    const key = `${move.fromCode}:${move.atBranchId}`;
    const group = groups.get(key) ?? { fromCode: move.fromCode, atBranchId: move.atBranchId, serialNumberIds: [] };
    group.serialNumberIds.push(move.serialNumberId);
    groups.set(key, group);
  }
  return [...groups.values()];
}

async function decideSerials(actor: PostingActor, transferId: string, input: SerialDecision) {
  const current = await loadLines(prisma, actor.tenantId, transferId);
  if (!current) throw new Error("Transfer not found");
  await assertTransferVisible(actor, current);
  if (!canDecideReceivingSerials(actor)) {
    throw new Error("You do not have permission for this logistics action");
  }
  await authorizeBranchScope(actor, current.toBranchId);

  const preview =
    input.kind === "accept"
      ? planTransferReceive({
          status: current.status,
          fromBranchId: current.fromBranchId,
          toBranchId: current.toBranchId,
          lines: current.lines,
          requestedSerialIds: input.serialNumberIds,
        })
      : planTransferSerialReject({
          status: current.status,
          fromBranchId: current.fromBranchId,
          toBranchId: current.toBranchId,
          lines: current.lines,
          serialNumberId: input.serialNumberId,
          remarks: input.remarks,
        });
  if (!preview.ok) throw new Error(preview.error);

  const codes = await inventoryIds(actor.tenantId);
  const remarks = input.kind === "reject" ? input.remarks.trim() : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const fresh = await loadLines(tx, actor.tenantId, transferId);
      if (!fresh) throw new Error("Transfer not found");
      const plan =
        input.kind === "accept"
          ? planTransferReceive({
              status: fresh.status,
              fromBranchId: fresh.fromBranchId,
              toBranchId: fresh.toBranchId,
              lines: fresh.lines,
              requestedSerialIds: input.serialNumberIds,
            })
          : planTransferSerialReject({
              status: fresh.status,
              fromBranchId: fresh.fromBranchId,
              toBranchId: fresh.toBranchId,
              lines: fresh.lines,
              serialNumberId: input.serialNumberId,
              remarks: input.remarks,
            });
      if (!plan.ok) throw new Error(plan.error);

      const slips = transferSlipNumbers(fresh.transferNo);
      const rsNo = fresh.rsNo ?? slips.rsNo;
      const drNo = fresh.drNo ?? slips.drNo;
      if (fresh.rsNo !== rsNo || fresh.drNo !== drNo) {
        await tx.branchTransfer.update({ where: { id: transferId }, data: { rsNo, drNo } });
      }

      const movedIds = plan.moves.map((move) => move.serialNumberId);
      if (movedIds.length > 0) {
        await lockSerialNumbers(tx, movedIds);
        await assertMovable(actor.tenantId, movedIds);
        // Accepted units land at the receiving branch; rejected ones go back to the releasing branch.
        const landBranchId = input.kind === "accept" ? fresh.toBranchId : fresh.fromBranchId;
        for (const group of groupMovesByHold(plan.moves)) {
          await claimInventory(tx, {
            tenantId: actor.tenantId,
            branchId: group.atBranchId,
            serialNumberIds: group.serialNumberIds,
            fromStatusCodeId: codes[group.fromCode],
            toStatusCodeId: codes.STK,
            userId: actor.userId,
            message: "A selected serial is not in transit on this transfer",
            toBranchId: landBranchId,
          });
        }
        const marked = await tx.branchTransferLine.updateMany({
          where: { transferId, serialNumberId: { in: movedIds }, decision: "pending" },
          data: {
            decision: input.kind === "accept" ? "accepted" : "rejected",
            remarks,
            decidedAt: new Date(),
            decidedById: actor.userId,
          },
        });
        if (marked.count !== movedIds.length) {
          throw new Error("A serial on this transfer was updated by someone else");
        }
      }

      if (plan.nextStatus !== fresh.status) {
        await claimHeader(tx, "branchTransfer", {
          id: transferId,
          tenantId: actor.tenantId,
          fromStatusCodeIds: [fresh.statusCodeId],
          toStatusCodeId: await workflowForHeader(actor.tenantId, plan.nextStatus),
          message: "This transfer was updated by someone else",
        });
      }

      const approval = await tx.branchTransferApprovalLevel.findFirst({
        where: { transferId, level: 1 },
        select: { approvedAt: true, approvedById: true },
      });
      const approver = approval?.approvedById
        ? await tx.user.findFirst({
            where: { id: approval.approvedById },
            select: { name: true, email: true },
          })
        : null;
      await writeHistory(tx, {
        tenantId: actor.tenantId,
        userId: actor.userId,
        transferNo: fresh.transferNo,
        serialNumberIds: movedIds,
        status: "STK",
        details: movementDetails({
          decision: input.kind === "accept" ? "accepted" : "rejected",
          transferNo: fresh.transferNo,
          approvedAt: approval?.approvedAt ?? null,
          approvedBy: creatorName(approver),
          remarks,
          rsNo,
          drNo,
        }),
      });
      await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh, "RECEIVING"), {
        serialNumberIds: movedIds,
        status: input.kind === "accept" ? "APPROVED" : "REJECTED",
        decidedById: actor.userId,
        remarks,
      });
      if (!plan.idempotent) {
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: input.kind === "accept" ? "transfer.received" : "transfer.serial_rejected",
            entityType: "BranchTransfer",
            entityId: transferId,
            metadata: {
              transferNo: fresh.transferNo,
              status: plan.nextStatus,
              serialNumberIds: input.kind === "accept" ? input.serialNumberIds : [input.serialNumberId],
              rsNo,
              drNo,
              remarks,
            },
          },
        });
      }
      return { movedCount: movedIds.length, status: plan.nextStatus, idempotent: plan.idempotent };
    });
  } catch (error) {
    throw postingError(
      error,
      input.kind === "accept" ? "Failed to receive transfer" : "Failed to reject serial",
    );
  }
}

export const transferPostingService = {
  async listModels(actor: PostingActor, branchId: string) {
    await authorizePosting(actor, "transfer.create", branchId);
    const serials = await this.listSerials(actor, branchId);
    const models = new Map<string, { id: string; skuCode: string; name: string }>();
    for (const serial of serials) {
      if (!models.has(serial.modelId)) {
        models.set(serial.modelId, {
          id: serial.modelId,
          skuCode: serial.skuCode,
          name: serial.modelName,
        });
      }
    }
    return [...models.values()].sort((a, b) => a.skuCode.localeCompare(b.skuCode));
  },

  async listSerials(actor: PostingActor, branchId: string, modelId?: string): Promise<TransferSerialOption[]> {
    await authorizePosting(actor, "transfer.create", branchId);
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
        serialNumber: {
          deletedAt: null,
          ...(modelId ? { modelId } : {}),
        },
      },
      select: {
        serialNumberId: true,
        statusCode: { select: { code: true, name: true, color: true } },
        serialNumber: {
          select: { serialNo: true, modelId: true, model: { select: { skuCode: true, name: true } } },
        },
      },
      orderBy: { serialNumber: { serialNo: "asc" } },
      take: 300,
    });
    const openDocs = await openDocumentIdsBySerial(
      actor.tenantId,
      rows.map((row) => row.serialNumberId),
    );
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
          inventoryStatus: row.statusCode,
        },
      ];
    });
  },

  async getDetail(actor: PostingActor, transferId: string): Promise<TransferDetail> {
    const transfer = await prisma.branchTransfer.findFirst({
      where: { id: transferId, tenantId: actor.tenantId },
      select: {
        id: true,
        transferNo: true,
        notes: true,
        createdAt: true,
        createdBy: { select: { name: true, email: true } },
        rsNo: true,
        drNo: true,
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        statusCode: { select: { code: true, name: true, color: true } },
        lines: {
          select: {
            quantity: true,
            serialNumberId: true,
            decision: true,
            remarks: true,
            requestRemarks: true,
            priorStatusCode: { select: { code: true } },
            serialNumber: {
              select: { serialNo: true, model: { select: { id: true, skuCode: true, name: true } } },
            },
          },
          orderBy: { serialNumber: { serialNo: "asc" } },
        },
      },
    });
    if (!transfer) throw new Error("Transfer not found");
    await assertTransferVisible(actor, {
      fromBranchId: transfer.fromBranch.id,
      toBranchId: transfer.toBranch.id,
      status: transfer.statusCode.code,
    });
    const inventory = transfer.lines.length
      ? await prisma.branchInventory.findMany({
          where: {
            tenantId: actor.tenantId,
            serialNumberId: { in: transfer.lines.map((line) => line.serialNumberId) },
            branchId: { in: [transfer.fromBranch.id, transfer.toBranch.id] },
          },
          select: {
            serialNumberId: true,
            branchId: true,
            statusCode: { select: { code: true, name: true, color: true } },
            branch: { select: { name: true } },
          },
        })
      : [];
    const inventoryBySerial = new Map(inventory.map((row) => [row.serialNumberId, row]));
    const status = asTransferStatus(transfer.statusCode.code);
    const history = await prisma.auditLog.findMany({
      where: { tenantId: actor.tenantId, entityType: "BranchTransfer", entityId: transfer.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, action: true, createdAt: true, user: { select: { name: true } } },
    });
    const firstModel = transfer.lines[0]?.serialNumber.model ?? null;
    return {
      id: transfer.id,
      transferNo: transfer.transferNo,
      notes: transfer.notes,
      createdAt: transfer.createdAt.toISOString(),
      createdBy: creatorName(transfer.createdBy),
      status: transfer.statusCode,
      rsNo: transfer.rsNo,
      drNo: transfer.drNo,
      fromBranch: transfer.fromBranch,
      toBranch: transfer.toBranch,
      model: firstModel,
      lines: transfer.lines.map((line) => {
        const row = inventoryBySerial.get(line.serialNumberId);
        return {
          serialNumberId: line.serialNumberId,
          serialNo: line.serialNumber.serialNo,
          skuCode: line.serialNumber.model.skuCode,
          modelName: line.serialNumber.model.name,
          quantity: line.quantity,
          priorCode: line.priorStatusCode?.code ?? null,
          inventoryCode: row?.statusCode.code ?? null,
          inventoryStatus: row?.statusCode ?? null,
          branchId: row?.branchId ?? null,
          branchName: row?.branch.name ?? null,
          decision: asLineDecision(line.decision),
          awaitingReceipt: status !== null && lineAwaitsReceipt({
            status,
            fromBranchId: transfer.fromBranch.id,
            toBranchId: transfer.toBranch.id,
            line: {
              inventoryCode: asInventoryCode(row?.statusCode.code),
              branchId: row?.branchId ?? null,
              decision: asLineDecision(line.decision),
            },
          }),
          remarks: line.remarks,
          requestRemarks: line.requestRemarks,
        };
      }),
      history: history.map((row) => ({
        id: row.id,
        action: row.action,
        at: row.createdAt.toISOString(),
        userName: row.user?.name || null,
      })),
    };
  },

  async create(
    actor: PostingActor,
    input: {
      fromBranchId: string;
      toBranchId: string;
      modelId: string;
      quantity: number;
      serialNumberIds: string[];
      lineRemarks?: TransferLineRemarks;
      transferNo?: string;
    },
  ) {
    await authorizePosting(actor, "transfer.create", input.fromBranchId);
    await assertSameDealerGroup(actor.tenantId, input.fromBranchId, input.toBranchId);
    const serials = await loadAllocatable(actor.tenantId, input.fromBranchId, input.serialNumberIds);
    const plan = planTransferCreate({
      fromBranchId: input.fromBranchId,
      toBranchId: input.toBranchId,
      modelId: input.modelId,
      quantity: input.quantity,
      serials,
    });
    if (!plan.ok) throw new Error(plan.error);

    const codes = await inventoryIds(actor.tenantId);
    const statusCodeId = await workflowId(actor.tenantId, "pending_tl");
    const requestedNo = input.transferNo?.trim() || "";

    const save = (transferNo: string) =>
      prisma.$transaction(async (tx) => {
        const serialIds = plan.holds.map((hold) => hold.serialNumberId);
        await lockSerialsThenInventoryRows(tx, actor.tenantId, input.fromBranchId, serialIds);
        await assertMovable(actor.tenantId, serialIds);
        const stillOpen = await openDocumentIdsBySerial(actor.tenantId, serialIds);
        if ([...stillOpen.values()].some((ids) => ids.length > 0)) {
          throw new Error("A serial is already on an open transfer or pull-out");
        }
        for (const prior of ["STK", "DEF"] as const) {
          const ids = plan.holds.filter((hold) => hold.priorCode === prior).map((hold) => hold.serialNumberId);
          await claimInventory(tx, {
            tenantId: actor.tenantId,
            branchId: input.fromBranchId,
            serialNumberIds: ids,
            fromStatusCodeId: codes[prior],
            toStatusCodeId: codes.RSV,
            userId: actor.userId,
            message: CLAIM_LOST,
          });
        }

        const row = await tx.branchTransfer.create({
          data: {
            tenantId: actor.tenantId,
            fromBranchId: input.fromBranchId,
            toBranchId: input.toBranchId,
            transferNo,
            statusCodeId,
            createdById: actor.userId,
            lines: {
              create: plan.holds.map((hold) => ({
                serialNumberId: hold.serialNumberId,
                quantity: 1,
                priorStatusCodeId: codes[hold.priorCode],
                requestRemarks: transferLineRemark(input.lineRemarks, hold.serialNumberId),
              })),
            },
            approvalLevels: { create: [{ level: 1, roleSlug: "tl" }] },
          },
          select: { id: true, transferNo: true },
        });

        await writeHistory(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          transferNo: row.transferNo,
          serialNumberIds: plan.holds.map((hold) => hold.serialNumberId),
          status: "RSV",
          details: `Reserved on ${row.transferNo}`,
        });
        await inventoryApprovalLedger.recordRequested(tx, approvalDocument(actor.tenantId, row, "TL_APPROVAL"), {
          requestedById: actor.userId,
          units: plan.holds.map((hold) => ({
            serialNumberId: hold.serialNumberId,
            remarks: transferLineRemark(input.lineRemarks, hold.serialNumberId),
          })),
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "transfer.created",
            entityType: "BranchTransfer",
            entityId: row.id,
            metadata: { transferNo: row.transferNo, serialCount: plan.holds.length },
          },
        });
        return row;
      });

    const saveWithFreshNoOnConflict = async () => {
      const transferNo = requestedNo || freshTransferNo();
      try {
        return await save(transferNo);
      } catch (error) {
        if (!isTransferNoConflict(error)) throw postingError(error, "Failed to create transfer");
        try {
          return await save(freshTransferNo(transferNo));
        } catch (retryError) {
          throw postingError(retryError, "Failed to create transfer");
        }
      }
    };

    const row = await saveWithFreshNoOnConflict();
    await notifyTransferApprovers(actor, {
      id: row.id,
      transferNo: row.transferNo,
      fromBranchId: input.fromBranchId,
      toBranchId: input.toBranchId,
    });
    return row;
  },

  async approve(actor: PostingActor, transferId: string) {
    const current = await loadLines(prisma, actor.tenantId, transferId);
    if (!current) throw new Error("Transfer not found");
    await assertTransferVisible(actor, current);
    await authorizePosting(actor, "transfer.approve", current.fromBranchId);
    await assertTransferApprover(actor, current.fromBranchId);
    const preview = planTransferApprove(current);
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) {
      const slips = transferSlipNumbers(current.transferNo);
      return {
        id: current.id,
        transferNo: current.transferNo,
        idempotent: true,
        rsNo: current.rsNo ?? slips.rsNo,
        drNo: current.drNo ?? slips.drNo,
      };
    }

    const codes = await inventoryIds(actor.tenantId);
    const nextStatusId = await workflowId(actor.tenantId, "in_transit");
    const fromIds = await Promise.all(
      (["pending_tl", "requested"] as const).map((code) => workflowId(actor.tenantId, code)),
    );

    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await loadLines(tx, actor.tenantId, transferId);
        if (!fresh) throw new Error("Transfer not found");
        const plan = planTransferApprove(fresh);
        if (!plan.ok) throw new Error(plan.error);
        if (plan.idempotent) return;

        const movedIds = plan.moves.map((move) => move.serialNumberId);
        await lockSerialNumbers(tx, movedIds);
        await assertMovable(actor.tenantId, movedIds);
        // Approval sends the units: the row moves to the receiving branch as DIT, so the
        // unit leaves the releasing branch's inventory and shows there as incoming.
        for (const from of ["RSV", "STK", "DEF"] as const) {
          await claimInventory(tx, {
            tenantId: actor.tenantId,
            branchId: fresh.fromBranchId,
            serialNumberIds: plan.moves.filter((move) => move.fromCode === from).map((move) => move.serialNumberId),
            fromStatusCodeId: codes[from],
            toStatusCodeId: codes.DIT,
            userId: actor.userId,
            message: CLAIM_LOST,
            toBranchId: fresh.toBranchId,
          });
        }
        // Legacy rows that were never reserved also never recorded their prior code.
        for (const prior of ["STK", "DEF"] as const) {
          const ids = plan.moves
            .filter((move) => move.fromCode !== "RSV" && move.priorCode === prior)
            .map((move) => move.serialNumberId);
          if (ids.length === 0) continue;
          await tx.branchTransferLine.updateMany({
            where: { transferId, serialNumberId: { in: ids }, priorStatusCodeId: null },
            data: { priorStatusCodeId: codes[prior] },
          });
        }

        await claimHeader(tx, "branchTransfer", {
          id: transferId,
          tenantId: actor.tenantId,
          fromStatusCodeIds: fromIds,
          toStatusCodeId: nextStatusId,
          message: "This transfer was updated by someone else",
        });
        await stampApproval(tx, transferId, actor.userId, "approved");
        await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh, "TL_APPROVAL"), {
          serialNumberIds: fresh.lines.map((line) => line.serialNumberId),
          status: "APPROVED",
          decidedById: actor.userId,
        });
        await inventoryApprovalLedger.recordRequested(tx, approvalDocument(actor.tenantId, fresh, "RECEIVING"), {
          requestedById: actor.userId,
          units: movedIds.map((serialNumberId) => ({ serialNumberId })),
        });
        const slips = transferSlipNumbers(fresh.transferNo);
        await tx.branchTransfer.update({
          where: { id: transferId },
          data: { rsNo: fresh.rsNo ?? slips.rsNo, drNo: fresh.drNo ?? slips.drNo },
        });
        await writeHistory(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          transferNo: fresh.transferNo,
          serialNumberIds: movedIds,
          status: "DIT",
          details: `Approved and in transit on ${fresh.transferNo}`,
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "transfer.approved",
            entityType: "BranchTransfer",
            entityId: transferId,
            metadata: {
              transferNo: fresh.transferNo,
              serialCount: movedIds.length,
              destinationStockAdded: false,
            },
          },
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to approve transfer");
    }

    const slips = transferSlipNumbers(current.transferNo);
    return {
      id: current.id,
      transferNo: current.transferNo,
      idempotent: false,
      rsNo: current.rsNo ?? slips.rsNo,
      drNo: current.drNo ?? slips.drNo,
    };
  },

  async reject(actor: PostingActor, transferId: string) {
    const current = await loadLines(prisma, actor.tenantId, transferId);
    if (!current) throw new Error("Transfer not found");
    await assertTransferVisible(actor, current);
    await authorizePosting(actor, "transfer.reject", current.fromBranchId);
    await assertTransferApprover(actor, current.fromBranchId);
    const preview = planTransferReject(current);
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) return { id: current.id, idempotent: true };

    const codes = await inventoryIds(actor.tenantId);
    const nextStatusId = await rejectStatusId(actor.tenantId);
    const fromIds = await Promise.all(
      (["pending_tl", "requested"] as const).map((code) => workflowId(actor.tenantId, code)),
    );

    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await loadLines(tx, actor.tenantId, transferId);
        if (!fresh) throw new Error("Transfer not found");
        const plan = planTransferReject(fresh);
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
            branchId: fresh.fromBranchId,
            serialNumberIds: ids,
            fromStatusCodeId: codes.RSV,
            toStatusCodeId: codes[prior],
            userId: actor.userId,
            message: "A reserved serial on this transfer could not be restored",
          });
        }
        await claimHeader(tx, "branchTransfer", {
          id: transferId,
          tenantId: actor.tenantId,
          fromStatusCodeIds: fromIds,
          toStatusCodeId: nextStatusId,
          message: "This transfer was updated by someone else",
        });
        await stampApproval(tx, transferId, actor.userId, "rejected");
        await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, fresh, "TL_APPROVAL"), {
          serialNumberIds: fresh.lines.map((line) => line.serialNumberId),
          status: "REJECTED",
          decidedById: actor.userId,
        });
        for (const prior of ["STK", "DEF"] as const) {
          await writeHistory(tx, {
            tenantId: actor.tenantId,
            userId: actor.userId,
            transferNo: fresh.transferNo,
            serialNumberIds: plan.restores
              .filter((row) => row.restoreCode === prior)
              .map((row) => row.serialNumberId),
            status: prior,
            details: `Hold released on ${fresh.transferNo}`,
          });
        }
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "transfer.rejected",
            entityType: "BranchTransfer",
            entityId: transferId,
            metadata: {
              transferNo: fresh.transferNo,
              restoredSerialIds: plan.restores.map((row) => row.serialNumberId),
            },
          },
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to reject transfer");
    }

    return { id: current.id, idempotent: false };
  },

  /** Legacy only: transfers approved while Logistics still released them (For transfer). */
  async release(actor: PostingActor, transferId: string) {
    const current = await loadLines(prisma, actor.tenantId, transferId);
    if (!current) throw new Error("Transfer not found");
    await assertTransferVisible(actor, current);
    await authorizePosting(actor, "transfer.release", current.fromBranchId);
    const preview = planTransferRelease(current);
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) return { id: current.id, idempotent: true, movedCount: 0 };

    const codes = await inventoryIds(actor.tenantId);
    const nextStatusId = await workflowId(actor.tenantId, "in_transit");
    const fromIds = await Promise.all(
      (["for_transfer", "approved"] as const).map((code) => workflowId(actor.tenantId, code)),
    );

    try {
      await prisma.$transaction(async (tx) => {
        const fresh = await loadLines(tx, actor.tenantId, transferId);
        if (!fresh) throw new Error("Transfer not found");
        const plan = planTransferRelease(fresh);
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
        // The row moves to the receiving branch, so the unit shows there as incoming
        // and no longer counts at the releasing branch.
        for (const from of ["FTR", "RSV"] as const) {
          await claimInventory(tx, {
            tenantId: actor.tenantId,
            branchId: fresh.fromBranchId,
            serialNumberIds: plan.moves.filter((move) => move.fromCode === from).map((move) => move.serialNumberId),
            fromStatusCodeId: codes[from],
            toStatusCodeId: codes.DIT,
            userId: actor.userId,
            message: "Some serials are not approved for transfer",
            toBranchId: fresh.toBranchId,
          });
        }
        await claimHeader(tx, "branchTransfer", {
          id: transferId,
          tenantId: actor.tenantId,
          fromStatusCodeIds: fromIds,
          toStatusCodeId: nextStatusId,
          message: "This transfer was updated by someone else",
        });
        await writeHistory(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          transferNo: fresh.transferNo,
          serialNumberIds: plan.moves.map((move) => move.serialNumberId),
          status: "DIT",
          details: `Released on ${fresh.transferNo}`,
        });
        await inventoryApprovalLedger.recordRequested(tx, approvalDocument(actor.tenantId, fresh, "RECEIVING"), {
          requestedById: actor.userId,
          units: plan.moves.map((move) => ({ serialNumberId: move.serialNumberId })),
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "transfer.released",
            entityType: "BranchTransfer",
            entityId: transferId,
            metadata: { transferNo: fresh.transferNo, serialCount: plan.moves.length },
          },
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to release transfer");
    }

    return { id: current.id, idempotent: false, movedCount: preview.moves.length };
  },

  async receive(actor: PostingActor, transferId: string, serialNumberIds: string[]) {
    return decideSerials(actor, transferId, { kind: "accept", serialNumberIds });
  },

  async rejectSerial(actor: PostingActor, transferId: string, serialNumberId: string, remarks: string) {
    return decideSerials(actor, transferId, { kind: "reject", serialNumberId, remarks });
  },
};
