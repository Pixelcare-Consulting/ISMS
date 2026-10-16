import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import type { AllocatableSerial } from "@/features/logistics/services/posting-planner-types";
import {
  asHoldCode,
  asInventoryCode,
  assertMovable,
  authorizePosting,
  claimHeader,
  claimInventory,
  lockInventoryRows,
  openDocumentIdsBySerial,
  postingError,
  type PostingActor,
  type PostingDb,
} from "@/features/logistics/services/posting-support";
import {
  planTransferApprove,
  planTransferCreate,
  planTransferReceive,
  planTransferReject,
  planTransferRelease,
  type TransferLineView,
  type TransferStatus,
} from "@/features/logistics/services/transfer-posting.planner";
import { STOCK_COUNT_FREEZE_SESSION_STATUSES } from "@/features/stock-audit/constants/stock-count-workflow";
import { prisma } from "@/lib/database/client";

const CLAIM_LOST = "One or more serials changed before this transfer could be saved";

export interface TransferSerialOption {
  serialNumberId: string;
  serialNo: string;
  modelId: string;
  skuCode: string;
  modelName: string;
  inventoryCode: "STK" | "DEF";
}

export interface TransferDetail {
  id: string;
  transferNo: string;
  notes: string | null;
  status: { code: string; name: string; color: string | null };
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
    branchId: string | null;
    branchName: string | null;
  }[];
  history: { id: string; action: string; at: string; userName: string | null }[];
}

function asTransferStatus(code: string): TransferStatus | null {
  switch (code) {
    case "requested":
    case "approved":
    case "draft":
    case "pending_tl":
    case "for_transfer":
    case "in_transit":
    case "accepted":
    case "rejected":
    case "completed":
    case "cancelled":
      return code;
    default:
      return null;
  }
}

function nextNo() {
  return `XFR-${Date.now().toString(36).toUpperCase()}`;
}

async function inventoryIds(tenantId: string) {
  const [stk, def, rsv, dit] = await Promise.all([
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "STK"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "DEF"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "RSV"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "DIT"),
  ]);
  return { STK: stk, DEF: def, RSV: rsv, DIT: dit };
}

async function workflowId(tenantId: string, code: string) {
  return reasonStatusService.requireCodeId(tenantId, "transfer_workflow", code);
}

async function rejectStatusId(tenantId: string) {
  const rejected = await prisma.reasonStatusCode.findFirst({
    where: { tenantId, code: "rejected", reasonStatus: { category: "transfer_workflow" } },
    select: { id: true },
  });
  if (rejected) return rejected.id;
  return workflowId(tenantId, "cancelled");
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
      lines: {
        select: {
          serialNumberId: true,
          priorStatusCodeId: true,
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
    lines: transfer.lines.map((line) => {
      const row = inventoryBySerial.get(line.serialNumberId);
      const onSource = row?.branchId === transfer.fromBranchId;
      const onDest = row?.branchId === transfer.toBranchId;
      return {
        serialNumberId: line.serialNumberId,
        priorCode: asHoldCode(line.priorStatusCode?.code),
        priorStatusCodeId: line.priorStatusCodeId,
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
      ? { approvedAt: new Date(), approvedById: userId, rejectedAt: null }
      : { rejectedAt: new Date(), approvedAt: null, approvedById: null };
  if (!existing) {
    await tx.branchTransferApprovalLevel.create({
      data: { transferId, level: 1, roleSlug: "tl", ...data },
    });
    return;
  }
  await tx.branchTransferApprovalLevel.update({ where: { id: existing.id }, data });
}

export const transferPostingService = {
  async listModels(actor: PostingActor, branchId: string) {
    await authorizePosting(actor, "transfer.create", null);
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
    await authorizePosting(actor, "transfer.create", null);
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
        statusCode: { select: { code: true } },
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
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        statusCode: { select: { code: true, name: true, color: true } },
        lines: {
          select: {
            quantity: true,
            serialNumberId: true,
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
            statusCode: { select: { code: true } },
            branch: { select: { name: true } },
          },
        })
      : [];
    const inventoryBySerial = new Map(inventory.map((row) => [row.serialNumberId, row]));
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
      status: transfer.statusCode,
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
          branchId: row?.branchId ?? null,
          branchName: row?.branch.name ?? null,
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
      notes?: string;
    },
  ) {
    await authorizePosting(actor, "transfer.create", input.toBranchId);
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
    const notes = input.notes?.trim() || null;

    try {
      return await prisma.$transaction(async (tx) => {
        const serialIds = plan.holds.map((hold) => hold.serialNumberId);
        await lockInventoryRows(tx, actor.tenantId, input.fromBranchId, serialIds);
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

        const transferNo = nextNo();
        const row = await tx.branchTransfer.create({
          data: {
            tenantId: actor.tenantId,
            fromBranchId: input.fromBranchId,
            toBranchId: input.toBranchId,
            transferNo,
            statusCodeId,
            notes,
            createdById: actor.userId,
            lines: {
              create: plan.holds.map((hold) => ({
                serialNumberId: hold.serialNumberId,
                quantity: 1,
                priorStatusCodeId: codes[hold.priorCode],
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
    } catch (error) {
      throw postingError(error, "Failed to create transfer");
    }
  },

  async approve(actor: PostingActor, transferId: string) {
    await authorizePosting(actor, "transfer.approve", null);
    const current = await loadLines(prisma, actor.tenantId, transferId);
    if (!current) throw new Error("Transfer not found");
    const preview = planTransferApprove(current);
    if (!preview.ok) throw new Error(preview.error);
    if (preview.idempotent) return { id: current.id, transferNo: current.transferNo, idempotent: true };

    const codes = await inventoryIds(actor.tenantId);
    const nextStatusId = await workflowId(actor.tenantId, "for_transfer");
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

        for (const prior of ["STK", "DEF"] as const) {
          const ids = plan.holds.filter((hold) => hold.priorCode === prior).map((hold) => hold.serialNumberId);
          await claimInventory(tx, {
            tenantId: actor.tenantId,
            branchId: fresh.fromBranchId,
            serialNumberIds: ids,
            fromStatusCodeId: codes[prior],
            toStatusCodeId: codes.RSV,
            userId: actor.userId,
            message: CLAIM_LOST,
          });
          if (ids.length > 0) {
            await tx.branchTransferLine.updateMany({
              where: { transferId, serialNumberId: { in: ids }, priorStatusCodeId: null },
              data: { priorStatusCodeId: codes[prior] },
            });
          }
        }

        await claimHeader(tx, "branchTransfer", {
          id: transferId,
          tenantId: actor.tenantId,
          fromStatusCodeIds: fromIds,
          toStatusCodeId: nextStatusId,
          message: "This transfer was updated by someone else",
        });
        await stampApproval(tx, transferId, actor.userId, "approved");
        await writeHistory(tx, {
          tenantId: actor.tenantId,
          userId: actor.userId,
          transferNo: fresh.transferNo,
          serialNumberIds: plan.holds.map((hold) => hold.serialNumberId),
          status: "RSV",
          details: `Reserved on ${fresh.transferNo}`,
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "transfer.approved",
            entityType: "BranchTransfer",
            entityId: transferId,
            metadata: { transferNo: fresh.transferNo, destinationStockAdded: false },
          },
        });
      });
    } catch (error) {
      throw postingError(error, "Failed to approve transfer");
    }

    return { id: current.id, transferNo: current.transferNo, idempotent: false };
  },

  async reject(actor: PostingActor, transferId: string) {
    await authorizePosting(actor, "transfer.reject", null);
    const current = await loadLines(prisma, actor.tenantId, transferId);
    if (!current) throw new Error("Transfer not found");
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

  async release(actor: PostingActor, transferId: string) {
    const current = await loadLines(prisma, actor.tenantId, transferId);
    if (!current) throw new Error("Transfer not found");
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
        await assertMovable(
          actor.tenantId,
          plan.moves.map((move) => move.serialNumberId),
        );
        await claimInventory(tx, {
          tenantId: actor.tenantId,
          branchId: fresh.fromBranchId,
          serialNumberIds: plan.moves.map((move) => move.serialNumberId),
          fromStatusCodeId: codes.RSV,
          toStatusCodeId: codes.DIT,
          userId: actor.userId,
          message: "Some serials are not reserved for release",
        });
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
    const current = await loadLines(prisma, actor.tenantId, transferId);
    if (!current) throw new Error("Transfer not found");
    await authorizePosting(actor, "transfer.receive", current.toBranchId);
    const preview = planTransferReceive({
      status: current.status,
      fromBranchId: current.fromBranchId,
      toBranchId: current.toBranchId,
      lines: current.lines,
      requestedSerialIds: serialNumberIds,
    });
    if (!preview.ok) throw new Error(preview.error);

    const codes = await inventoryIds(actor.tenantId);
    const acceptedId = await workflowId(actor.tenantId, "accepted");
    const inTransitId = await workflowId(actor.tenantId, "in_transit");

    try {
      const result = await prisma.$transaction(async (tx) => {
        const fresh = await loadLines(tx, actor.tenantId, transferId);
        if (!fresh) throw new Error("Transfer not found");
        const plan = planTransferReceive({
          status: fresh.status,
          fromBranchId: fresh.fromBranchId,
          toBranchId: fresh.toBranchId,
          lines: fresh.lines,
          requestedSerialIds: serialNumberIds,
        });
        if (!plan.ok) throw new Error(plan.error);
        if (plan.moves.length === 0) {
          if (plan.nextStatus === "accepted" && fresh.status === "in_transit") {
            await claimHeader(tx, "branchTransfer", {
              id: transferId,
              tenantId: actor.tenantId,
              fromStatusCodeIds: [inTransitId],
              toStatusCodeId: acceptedId,
              message: "This transfer was updated by someone else",
            });
          }
          return { movedCount: 0, status: plan.nextStatus, idempotent: true };
        }

        await assertMovable(
          actor.tenantId,
          plan.moves.map((move) => move.serialNumberId),
        );
        for (const prior of ["STK", "DEF"] as const) {
          const ids = plan.moves.filter((move) => move.restoreCode === prior).map((move) => move.serialNumberId);
          await claimInventory(tx, {
            tenantId: actor.tenantId,
            branchId: fresh.fromBranchId,
            serialNumberIds: ids,
            fromStatusCodeId: codes.DIT,
            toStatusCodeId: codes[prior],
            userId: actor.userId,
            message: "A selected serial is not in transit from the releasing branch",
            toBranchId: fresh.toBranchId,
          });
        }

        if (plan.nextStatus === "accepted") {
          await claimHeader(tx, "branchTransfer", {
            id: transferId,
            tenantId: actor.tenantId,
            fromStatusCodeIds: [inTransitId],
            toStatusCodeId: acceptedId,
            message: "This transfer was updated by someone else",
          });
        }

        for (const prior of ["STK", "DEF"] as const) {
          await writeHistory(tx, {
            tenantId: actor.tenantId,
            userId: actor.userId,
            transferNo: fresh.transferNo,
            serialNumberIds: plan.moves
              .filter((move) => move.restoreCode === prior)
              .map((move) => move.serialNumberId),
            status: prior,
            details: `Received on ${fresh.transferNo}`,
          });
        }
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "transfer.received",
            entityType: "BranchTransfer",
            entityId: transferId,
            metadata: {
              transferNo: fresh.transferNo,
              status: plan.nextStatus,
              serialNumberIds: plan.moves.map((move) => move.serialNumberId),
            },
          },
        });
        return { movedCount: plan.moves.length, status: plan.nextStatus, idempotent: false };
      });
      return result;
    } catch (error) {
      throw postingError(error, "Failed to receive transfer");
    }
  },
};
