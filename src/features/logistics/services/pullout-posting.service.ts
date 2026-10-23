import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { sapService } from "@/features/sap/services/sap.service";
import type { AllocatableSerial } from "@/features/logistics/services/posting-planner-types";
import {
  planPulloutApprove,
  planPulloutComplete,
  planPulloutCreate,
  planPulloutFinalize,
  planPulloutReject,
  planPulloutUpdateList,
  pulloutSapMessage,
  type PulloutLineView,
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

const CLAIM_LOST = "One or more serials changed before this pull-out could be saved";

export interface PulloutSerialOption {
  serialNumberId: string;
  serialNo: string;
  modelId: string;
  skuCode: string;
  modelName: string;
  inventoryCode: "STK" | "DEF";
}

/** Checklist choices for one selected serial. Each list needs at least one active lookup. */
export interface PulloutCreateLine {
  serialNumberId: string;
  pulloutClassificationIds: string[];
  unitPackingConditionIds: string[];
  accessoryCompletenessIds: string[];
}

export interface PulloutCreateInput {
  branchId: string;
  warehouseId: string;
  reasonStatusCodeId: string;
  lines: PulloutCreateLine[];
  notes?: string;
}

export interface PulloutSapJob {
  id: string;
  status: string;
  sapDocRef: string | null;
  stub: boolean;
  message: string;
}

export interface PulloutDetail {
  id: string;
  pulloutNo: string;
  notes: string | null;
  waybillNo: string | null;
  createdAt: string;
  createdByName: string | null;
  scheduledAt: string | null;
  scheduledByName: string | null;
  actualScheduledDate: string | null;
  status: { code: string; name: string; color: string | null };
  branch: { id: string; name: string };
  warehouse: { id: string; name: string; code: string };
  warehouseLocation: { name: string; code: string } | null;
  reason: { id: string; code: string; name: string; color: string | null } | null;
  lines: {
    serialNumberId: string;
    serialNo: string;
    skuCode: string;
    modelName: string;
    priorCode: string | null;
    inventoryCode: string | null;
    classificationNames: string[];
    unitPackingConditionNames: string[];
    accessoryCompletenessNames: string[];
  }[];
  sapJob: PulloutSapJob | null;
  history: { id: string; action: string; at: string; userName: string | null }[];
}

function asPulloutStatus(code: string): PulloutStatus | null {
  switch (code) {
    case "requested":
    case "approved":
    case "draft":
    case "pending_tl":
    case "for_pullout":
    case "scheduled":
    case "pending_logistics":
    case "in_transit":
    case "pulled_out":
    case "completed":
    case "cancelled":
      return code;
    default:
      return null;
  }
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

async function workflowId(tenantId: string, code: string) {
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
      notes: true,
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
  const lines: (PulloutLineView & { priorStatusCodeId: string | null })[] = pullout.lines.map((line) => ({
    serialNumberId: line.serialNumberId,
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
    status: string;
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
      ? { approvedAt: new Date(), approvedById: userId, rejectedAt: null }
      : { rejectedAt: new Date(), approvedAt: null, approvedById: null };
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
  "Choose classification, unit packing condition, and accessory completeness for every selected serial";
const CHECKLIST_DUPLICATE =
  "Each classification, packing condition, and accessory completeness can only be chosen once";
const CHECKLIST_INACTIVE =
  "Choose an active classification, unit packing condition, and accessory completeness for every selected serial";

function requireChecklistIds(ids: readonly string[] | undefined): void {
  if (!ids || ids.length === 0 || ids.some((id) => id.length === 0)) {
    throw new Error(CHECKLIST_REQUIRED);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error(CHECKLIST_DUPLICATE);
  }
}

function checklistBySerial(lines: readonly PulloutCreateLine[]): Map<string, PulloutCreateLine> {
  if (lines.length === 0) throw new Error("Select the serials to pull out");
  const bySerial = new Map<string, PulloutCreateLine>();
  for (const line of lines) {
    if (!line.serialNumberId) throw new Error(CHECKLIST_REQUIRED);
    requireChecklistIds(line.pulloutClassificationIds);
    requireChecklistIds(line.unitPackingConditionIds);
    requireChecklistIds(line.accessoryCompletenessIds);
    if (bySerial.has(line.serialNumberId)) {
      throw new Error("Each serial can only be selected once");
    }
    bySerial.set(line.serialNumberId, line);
  }
  return bySerial;
}

async function assertActiveChecklist(
  tenantId: string,
  lines: readonly PulloutCreateLine[],
): Promise<void> {
  const classificationIds = [...new Set(lines.flatMap((line) => line.pulloutClassificationIds))];
  const packingIds = [...new Set(lines.flatMap((line) => line.unitPackingConditionIds))];
  const accessoryIds = [...new Set(lines.flatMap((line) => line.accessoryCompletenessIds))];
  const [classifications, packings, accessories] = await Promise.all([
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
  ]);
  const activeClassifications = new Set(classifications.map((row) => row.id));
  const activePackings = new Set(packings.map((row) => row.id));
  const activeAccessories = new Set(accessories.map((row) => row.id));
  for (const line of lines) {
    if (
      line.pulloutClassificationIds.some((id) => !activeClassifications.has(id)) ||
      line.unitPackingConditionIds.some((id) => !activePackings.has(id)) ||
      line.accessoryCompletenessIds.some((id) => !activeAccessories.has(id))
    ) {
      throw new Error(CHECKLIST_INACTIVE);
    }
  }
}

function savedNames(names: readonly (string | null | undefined)[]): string[] {
  return names.flatMap((name) => {
    const trimmed = displayName(name);
    return trimmed ? [trimmed] : [];
  });
}

function jobStub(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as { stub?: unknown }).stub === true;
}

async function loadSapJob(tenantId: string, pulloutId: string): Promise<PulloutSapJob | null> {
  const job = await prisma.sapIntegrationJob.findFirst({
    where: { tenantId, referenceId: pulloutId, jobType: "pullout_itr" },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, sapDocRef: true },
  });
  if (!job) return null;
  const audit = await prisma.auditLog.findFirst({
    where: { tenantId, entityId: pulloutId, action: "sap.pullout_itr_processed" },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  const stub = jobStub(audit?.metadata);
  const view = { id: job.id, status: job.status, sapDocRef: job.sapDocRef, stub };
  return { ...view, message: pulloutSapMessage(view) };
}

export const pulloutPostingService = {
  async listSerials(actor: PostingActor, branchId: string): Promise<PulloutSerialOption[]> {
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

  async getDetail(actor: PostingActor, pulloutId: string): Promise<PulloutDetail> {
    const pullout = await prisma.branchPullout.findFirst({
      where: { id: pulloutId, tenantId: actor.tenantId },
      select: {
        id: true,
        pulloutNo: true,
        notes: true,
        waybillNo: true,
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
        lines: {
          select: {
            serialNumberId: true,
            priorStatusCode: { select: { code: true } },
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
          select: { serialNumberId: true, statusCode: { select: { code: true } } },
        })
      : [];
    const inventoryBySerial = new Map(inventory.map((row) => [row.serialNumberId, row]));
    const [history, sapJob] = await Promise.all([
      prisma.auditLog.findMany({
        where: { tenantId: actor.tenantId, entityType: "BranchPullout", entityId: pullout.id },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, action: true, createdAt: true, user: { select: { name: true } } },
      }),
      loadSapJob(actor.tenantId, pullout.id),
    ]);
    return {
      id: pullout.id,
      pulloutNo: pullout.pulloutNo,
      notes: pullout.notes,
      waybillNo: pullout.waybillNo,
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
      })),
      sapJob,
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
    await assertActiveChecklist(actor.tenantId, input.lines);
    const reason = await prisma.reasonStatusCode.findFirst({
      where: {
        id: input.reasonStatusCodeId,
        tenantId: actor.tenantId,
        reasonStatus: { category: "pullout_reason" },
      },
      select: { id: true, reasonStatusId: true, name: true },
    });
    if (!reason) throw new Error("Choose a pull-out reason");

    const serials = await loadAllocatable(actor.tenantId, input.branchId, [...checklist.keys()]);
    const plan = planPulloutCreate({
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      serials,
    });
    if (!plan.ok) throw new Error(plan.error);
    if (
      plan.lines.length !== checklist.size ||
      plan.lines.some((line) => !checklist.has(line.serialNumberId))
    ) {
      throw new Error(CHECKLIST_REQUIRED);
    }

    const codes = await inventoryIds(actor.tenantId);
    const statusCodeId = await workflowId(actor.tenantId, "pending_tl");

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
            warehouseId: input.warehouseId,
            pulloutNo,
            statusCodeId,
            reasonStatusId: reason.reasonStatusId,
            reasonStatusCodeId: reason.id,
            notes: input.notes?.trim() || null,
            createdById: actor.userId,
            lines: {
              create: plan.lines.map((line) => {
                const choice = checklist.get(line.serialNumberId);
                if (!choice) throw new Error(CHECKLIST_REQUIRED);
                return {
                  serialNumberId: line.serialNumberId,
                  priorStatusCodeId: codes[line.priorCode],
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
              }),
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
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "pullout.created",
            entityType: "BranchPullout",
            entityId: row.id,
            metadata: {
              pulloutNo: row.pulloutNo,
              reasonName: reason.name,
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

    const codes = await inventoryIds(actor.tenantId);
    const nextStatusId = await workflowId(actor.tenantId, "for_pullout");
    const pendingId = await workflowId(actor.tenantId, "pending_tl");

    try {
      await prisma.$transaction(async (tx) => {
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
        await stampApproval(tx, pulloutId, actor.userId, "approved");
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
      });
    } catch (error) {
      throw postingError(error, "Failed to approve pull-out");
    }

    return { id: current.id, pulloutNo: current.pulloutNo, idempotent: false };
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
      warehouseId?: string;
      waybillNo?: string | null;
      notes?: string | null;
      serialNumberIds?: string[];
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

    const codes = await inventoryIds(actor.tenantId);
    const nextStatusId = await workflowId(actor.tenantId, "pending_logistics");
    const fromIds = await Promise.all(
      (["for_pullout", "pending_logistics"] as const).map((code) => workflowId(actor.tenantId, code)),
    );
    const warehouseId = input.warehouseId ?? current.warehouseId;
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId: actor.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!warehouse) throw new Error("Choose a warehouse");

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
        if (freshPlan.holds.length > 0) {
          // New lines from this screen have no checklist. Kept lines are not rewritten.
          await tx.branchPulloutLine.createMany({
            data: freshPlan.holds.map((hold) => ({
              pulloutId: fresh.id,
              serialNumberId: hold.serialNumberId,
              priorStatusCodeId: codes[hold.priorCode],
            })),
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
            warehouseId,
            waybillNo: input.waybillNo === undefined ? fresh.waybillNo : input.waybillNo?.trim() || null,
            notes: input.notes === undefined ? fresh.notes : input.notes?.trim() || null,
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
    if (preview.createsWarehouseInventory || preview.setsCompleted || preview.nextStatus !== "in_transit") {
      throw new Error("Warehouse receipt is not available yet. Units stay in transit.");
    }

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
          if (plan.createsWarehouseInventory || plan.setsCompleted) {
            throw new Error("Warehouse receipt is not available yet. Units stay in transit.");
          }
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

    const job = await sapService.emitPulloutItr(actor.tenantId, {
      id: current.id,
      pulloutNo: current.pulloutNo,
      branchId: current.branchId,
      warehouseId: current.warehouseId,
    });
    const sapJob = await loadSapJob(actor.tenantId, current.id);
    return {
      id: current.id,
      pulloutNo: current.pulloutNo,
      status: "in_transit" as const,
      idempotent: preview.idempotent,
      sapJob: sapJob ?? {
        id: job.id,
        status: job.status,
        sapDocRef: job.sapDocRef,
        stub: false,
        message: pulloutSapMessage({ status: job.status, stub: false }),
      },
    };
  },

  async complete(actor: PostingActor, pulloutId: string) {
    await authorizePosting(actor, "pullout.complete", null);
    const current = await loadPullout(prisma, actor.tenantId, pulloutId);
    if (!current) throw new Error("Pull-out not found");
    const refused = planPulloutComplete();
    throw new Error(refused.error);
  },
};
