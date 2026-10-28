"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditService } from "@/features/audit/services/audit.service";
import {
  LOGISTICS_CREATE,
  LOGISTICS_DELIVERY_DISPATCH,
  LOGISTICS_DELIVERY_RECEIVE,
  LOGISTICS_DELIVERY_RETURN_APPROVE,
  LOGISTICS_DELIVERY_RETURN_REQUEST,
  LOGISTICS_DELIVERY_TRANSFER_APPROVE,
  LOGISTICS_DELIVERY_TRANSFER_CREATE,
  LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
  LOGISTICS_MANAGE,
  LOGISTICS_PAGE_PERMISSIONS,
} from "@/features/logistics/constants/logistics-permissions";
import { logisticsRepository } from "@/features/logistics/repositories/logistics.repository";
import { deliveryPostingService } from "@/features/logistics/services/delivery-posting.service";
import { runSapCopyToFollow } from "@/features/logistics/services/sap-copy-to-follow.service";
import {
  deliveryReturnCancelNoteSchema,
  deliveryReturnDecisionSchema,
  deliveryReturnReasonSchema,
  deliveryReturnSerialIdsSchema,
  deliveryReturnService,
  type DeliveryReturnDetail,
} from "@/features/logistics/services/delivery-return.service";
import {
  deliveryTransferService,
  type DeliveryTransferDraft,
} from "@/features/logistics/services/delivery-transfer.service";
import { pulloutPostingService } from "@/features/logistics/services/pullout-posting.service";
import { transferPostingService } from "@/features/logistics/services/transfer-posting.service";
import type { PostingActor } from "@/features/logistics/services/posting-support";
import type {
  DeliveryListSort,
  LogisticsListSortDir,
  PulloutListSort,
  TransferListSort,
} from "@/features/logistics/repositories/logistics.repository";
import { DELIVERY_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import {
  resolveLogisticsBranchScope,
  transferListWhere,
} from "@/features/logistics/lib/transfer-visibility";
import { parseScheduleDate } from "@/features/logistics/lib/shipment";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

const DISPATCH_PERMISSIONS = [
  LOGISTICS_DELIVERY_DISPATCH,
  LOGISTICS_MANAGE,
] as const;

const DELIVERY_RECEIVE_PERMISSIONS = [
  LOGISTICS_CREATE,
  LOGISTICS_MANAGE,
  "orders.create",
  LOGISTICS_DELIVERY_RECEIVE,
] as const;

const LOGISTICS_WRITE_ALIASES = [
  LOGISTICS_CREATE,
  LOGISTICS_MANAGE,
  "orders.create",
] as const;

const DELIVERY_SORT_FIELDS = new Set<DeliveryListSort>([
  "deliveryNo",
  "orderNumber",
  "branch",
  "status",
]);
const TRANSFER_SORT_FIELDS = new Set<TransferListSort>([
  "transferNo",
  "fromBranch",
  "toBranch",
  "status",
]);
const PULLOUT_SORT_FIELDS = new Set<PulloutListSort>([
  "pulloutNo",
  "branch",
  "warehouse",
  "reason",
  "status",
]);

function parseSortDir(value?: string): LogisticsListSortDir | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

function parseDeliverySort(value?: string): DeliveryListSort | undefined {
  return value && DELIVERY_SORT_FIELDS.has(value as DeliveryListSort)
    ? (value as DeliveryListSort)
    : undefined;
}

function parseTransferSort(value?: string): TransferListSort | undefined {
  return value && TRANSFER_SORT_FIELDS.has(value as TransferListSort)
    ? (value as TransferListSort)
    : undefined;
}

function parsePulloutSort(value?: string): PulloutListSort | undefined {
  return value && PULLOUT_SORT_FIELDS.has(value as PulloutListSort)
    ? (value as PulloutListSort)
    : undefined;
}

const deliverySchema = z.object({ branchId: z.string().min(1) });
const transferSchema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  modelId: z.string().min(1),
  quantity: z.number().int().positive(),
  serialNumberIds: z.array(z.string().min(1)).min(1),
  notes: z.string().optional(),
  transferNo: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((value) => value || undefined),
});
const checklistIdList = z.array(z.string().min(1)).min(1);
const pulloutLineSchema = z.object({
  serialNumberId: z.string().min(1),
  pulloutClassificationIds: checklistIdList,
  unitPackingConditionIds: checklistIdList,
  accessoryCompletenessIds: checklistIdList,
});
const pulloutSchema = z.object({
  branchId: z.string().min(1),
  warehouseId: z.string().min(1),
  reasonStatusCodeId: z.string().min(1),
  lines: z.array(pulloutLineSchema).min(1),
  notes: z.string().optional(),
});
const pulloutListSchema = z.object({
  warehouseId: z.string().min(1),
  waybillNo: z.string().optional(),
  notes: z.string().optional(),
  serialNumberIds: z.array(z.string().min(1)).min(1),
});
const shipmentSchema = z.object({
  waybillNo: z.string().trim().min(1).max(80),
  courierName: z.string().trim().min(1).max(120),
  scheduledAt: z.string().trim().min(1),
});
const SHIPMENT_INPUT_ERROR = "Enter the waybill, courier or forwarder, and schedule date";

const serialIdsSchema = z.object({
  serialNumberIds: z.array(z.string().min(1)).min(1),
});

const placeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("BRANCH"), id: z.string().min(1) }),
  z.object({ kind: z.literal("WAREHOUSE"), id: z.string().min(1), locationId: z.string().min(1).nullish() }),
]);
const deliveryTransferSchema = z.object({
  deliveryId: z.string().min(1),
  release: placeSchema,
  receive: placeSchema,
  lines: z
    .array(z.object({ serialNumberId: z.string().min(1), remarks: z.string().max(500).nullish() }))
    .min(1),
});

function nextNo(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function revalidateLogisticsPaths() {
  revalidatePath("/logistics");
  revalidatePath("/logistics/deliveries");
  revalidatePath("/logistics/delivery-transfers");
  revalidatePath("/logistics/transfers");
  revalidatePath("/logistics/pickups");
}

function revalidateDelivery(id: string) {
  revalidateLogisticsPaths();
  revalidatePath(`/logistics/deliveries/${id}`);
  revalidatePath("/operations");
  revalidatePath("/inventory");
}

function postingActor(session: {
  user: { tenantId: string; id: string; permissions?: string[] };
}): PostingActor {
  return {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    permissions: session.user.permissions,
  };
}

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

export interface LogisticsKpis {
  total: number;
  statuses: {
    code: string;
    name: string;
    count: number;
    color: string | null;
    sortOrder: number;
  }[];
}

async function buildLogisticsKpis(
  tenantId: string,
  category: "delivery_workflow" | "transfer_workflow" | "pullout_workflow",
  countByStatus: () => Promise<{ statusCodeId: string; _count: { id: number } }[]>,
  countAll: () => Promise<number>,
): Promise<LogisticsKpis> {
  const codes = await reasonStatusService.listActiveCodes(tenantId, category);
  const [statusGroups, total] = await Promise.all([countByStatus(), countAll()]);
  const countByCodeId = new Map(statusGroups.map((g) => [g.statusCodeId, g._count.id]));
  return {
    total,
    statuses: codes.map((c) => ({
      code: c.code,
      name: c.name,
      color: c.color,
      sortOrder: c.sortOrder,
      count: countByCodeId.get(c.id) ?? 0,
    })),
  };
}

export async function getDeliveryKpisAction(): Promise<LogisticsKpis> {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const tid = session.user.tenantId;
  return buildLogisticsKpis(
    tid,
    "delivery_workflow",
    () => logisticsRepository.countDeliveriesByStatus(tid),
    () => logisticsRepository.countAllDeliveries(tid),
  );
}

export async function getTransferKpisAction(): Promise<LogisticsKpis> {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const tid = session.user.tenantId;
  const where = transferListWhere(
    await resolveLogisticsBranchScope({
      tenantId: tid,
      userId: session.user.id,
      permissions: session.user.permissions,
    }),
  );
  return buildLogisticsKpis(
    tid,
    "transfer_workflow",
    () => logisticsRepository.countTransfersByStatus(tid, where),
    () => logisticsRepository.countAllTransfers(tid, where),
  );
}

export async function getPulloutKpisAction(): Promise<LogisticsKpis> {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const tid = session.user.tenantId;
  return buildLogisticsKpis(
    tid,
    "pullout_workflow",
    () => logisticsRepository.countPulloutsByStatus(tid),
    () => logisticsRepository.countAllPullouts(tid),
  );
}

export async function listDeliveriesAction(input?: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  return logisticsRepository.listDeliveries(
    session.user.tenantId,
    {
      page: input?.page,
      limit: parseTablePageSize(input?.limit),
    },
    { field: parseDeliverySort(input?.sort), dir: parseSortDir(input?.sortDir) },
  );
}

export async function getDeliveryDetailAction(id: string) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  try {
    const detail = await deliveryPostingService.getDetail(postingActor(session), id);
    return { success: true as const, detail };
  } catch (error) {
    return actionError(error, "Delivery not found");
  }
}

export async function saveDeliveryShipmentAction(id: string, input: unknown) {
  const session = await requireAnyPermission([...DISPATCH_PERMISSIONS]);
  const parsed = shipmentSchema.safeParse(input);
  const scheduledAt = parsed.success ? parseScheduleDate(parsed.data.scheduledAt) : null;
  if (!parsed.success || !scheduledAt) return { error: SHIPMENT_INPUT_ERROR };
  try {
    await deliveryPostingService.saveShipment(postingActor(session), id, {
      waybillNo: parsed.data.waybillNo,
      courierName: parsed.data.courierName,
      scheduledAt,
    });
    revalidateDelivery(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to save waybill and schedule");
  }
}

export async function createDeliveryAction(input: unknown) {
  const session = await requireAnyPermission([LOGISTICS_CREATE, LOGISTICS_MANAGE]);
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "delivery_workflow",
    DELIVERY_WORKFLOW_CODE.approved,
  );

  const row = await prisma.branchDelivery.create({
    data: {
      tenantId: session.user.tenantId,
      branchId: parsed.data.branchId,
      deliveryNo: nextNo("DLV"),
      statusCodeId,
    },
    include: { branch: { select: { name: true } } },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "delivery.created",
    entityType: "BranchDelivery",
    entityId: row.id,
    metadata: {
      deliveryNo: row.deliveryNo,
      branchName: row.branch.name,
    },
  });

  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

/**
 * Run the SAP Copy To follow-up now instead of waiting for the next cron tick (about every
 * 10 minutes). A run already in progress is joined, not repeated.
 */
export async function checkSapCopyToNowAction() {
  const session = await requireAnyPermission([...DISPATCH_PERMISSIONS]);
  try {
    const result = await runSapCopyToFollow(session.user.tenantId, { budgetMs: 45_000 });
    revalidateLogisticsPaths();
    return { success: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not check SAP" };
  }
}

export async function listDeliveryReceiptLinesAction(id: string) {
  const session = await requireAnyPermission([...DELIVERY_RECEIVE_PERMISSIONS]);
  try {
    const result = await deliveryPostingService.listReceiptLines(
      {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        permissions: session.user.permissions,
      },
      id,
    );
    return { success: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load delivery serials" };
  }
}

export async function acceptDeliveryAction(id: string, input?: unknown) {
  const session = await requireAnyPermission([...DELIVERY_RECEIVE_PERMISSIONS]);
  const parsed = input
    ? z.object({ serialNumberIds: z.array(z.string().min(1)).optional() }).safeParse(input)
    : { success: true as const, data: {} };
  if (!parsed.success) return { error: "Invalid input" };

  try {
    const result = await deliveryPostingService.accept({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      permissions: session.user.permissions,
      deliveryId: id,
      serialNumberIds: parsed.data.serialNumberIds,
    });
    revalidateDelivery(id);
    return {
      success: true as const,
      movedCount: result.movedCount,
      status: result.status,
      idempotent: result.idempotent,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to accept delivery" };
  }
}

export async function listTransfersAction(input?: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const where = transferListWhere(
    await resolveLogisticsBranchScope({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      permissions: session.user.permissions,
    }),
  );
  return logisticsRepository.listTransfers(
    session.user.tenantId,
    {
      page: input?.page,
      limit: parseTablePageSize(input?.limit),
    },
    { field: parseTransferSort(input?.sort), dir: parseSortDir(input?.sortDir) },
    where,
  );
}

const TL_PERMISSIONS = ["orders.approve", LOGISTICS_MANAGE] as const;
const RECEIVE_SERIAL_PERMISSIONS = [...LOGISTICS_WRITE_ALIASES, ...TL_PERMISSIONS] as const;

function revalidateTransfer(id: string) {
  revalidateLogisticsPaths();
  revalidatePath(`/logistics/transfers/${id}`);
  revalidatePath("/operations");
  revalidatePath("/inventory");
}

function revalidatePullout(id: string) {
  revalidateLogisticsPaths();
  revalidatePath(`/logistics/pickups/${id}`);
  revalidatePath("/operations");
  revalidatePath("/inventory");
}

export async function getTransferDetailAction(id: string) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  try {
    const detail = await transferPostingService.getDetail(postingActor(session), id);
    return { success: true as const, detail };
  } catch (error) {
    return actionError(error, "Transfer not found");
  }
}

export async function saveTransferShipmentAction(id: string, input: unknown) {
  const session = await requirePermission(LOGISTICS_MANAGE);
  const parsed = shipmentSchema.safeParse(input);
  const scheduledAt = parsed.success ? parseScheduleDate(parsed.data.scheduledAt) : null;
  if (!parsed.success || !scheduledAt) return { error: SHIPMENT_INPUT_ERROR };
  try {
    await transferPostingService.saveShipment(postingActor(session), id, {
      waybillNo: parsed.data.waybillNo,
      courierName: parsed.data.courierName,
      scheduledAt,
    });
    revalidateTransfer(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to save waybill and schedule");
  }
}

export async function listTransferModelsAction(branchId: string) {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  try {
    const models = await transferPostingService.listModels(postingActor(session), branchId);
    return { success: true as const, models };
  } catch (error) {
    return actionError(error, "Failed to load models");
  }
}

export async function listTransferSerialsAction(branchId: string, modelId: string) {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  try {
    const serials = await transferPostingService.listSerials(postingActor(session), branchId, modelId);
    return { success: true as const, serials };
  } catch (error) {
    return actionError(error, "Failed to load serials");
  }
}

export async function createTransferAction(input: unknown) {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose branches, a model, and the serials to transfer" };
  try {
    const row = await transferPostingService.create(postingActor(session), parsed.data);
    revalidateTransfer(row.id);
    return { success: true as const, id: row.id, transferNo: row.transferNo };
  } catch (error) {
    return actionError(error, "Failed to create transfer");
  }
}

export async function approveTransferAction(id: string) {
  const session = await requireAnyPermission([...TL_PERMISSIONS]);
  try {
    const result = await transferPostingService.approve(postingActor(session), id);
    revalidateTransfer(id);
    return {
      success: true as const,
      transferNo: result.transferNo,
      rsNo: result.rsNo,
      drNo: result.drNo,
    };
  } catch (error) {
    return actionError(error, "Failed to approve transfer");
  }
}

export async function rejectTransferAction(id: string) {
  const session = await requireAnyPermission([...TL_PERMISSIONS]);
  try {
    await transferPostingService.reject(postingActor(session), id);
    revalidateTransfer(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to reject transfer");
  }
}

export async function executeTransferAction(id: string) {
  const session = await requirePermission(LOGISTICS_MANAGE);
  try {
    const result = await transferPostingService.release(postingActor(session), id);
    revalidateTransfer(id);
    return { success: true as const, movedCount: result.movedCount, idempotent: result.idempotent };
  } catch (error) {
    return actionError(error, "Failed to release transfer");
  }
}

export async function receiveTransferAction(id: string, input: unknown) {
  const session = await requireAnyPermission([...RECEIVE_SERIAL_PERMISSIONS]);
  const parsed = serialIdsSchema.safeParse(input);
  if (!parsed.success) return { error: "Select the serials that arrived" };
  try {
    const result = await transferPostingService.receive(
      postingActor(session),
      id,
      parsed.data.serialNumberIds,
    );
    revalidateTransfer(id);
    return { success: true as const, ...result };
  } catch (error) {
    return actionError(error, "Failed to receive transfer");
  }
}

const rejectSerialSchema = z.object({
  serialNumberId: z.string().min(1),
  remarks: z.string().trim().min(1).max(500),
});

export async function rejectTransferSerialAction(id: string, input: unknown) {
  const session = await requireAnyPermission([...RECEIVE_SERIAL_PERMISSIONS]);
  const parsed = rejectSerialSchema.safeParse(input);
  if (!parsed.success) return { error: "Say why this serial was rejected" };
  try {
    const result = await transferPostingService.rejectSerial(
      postingActor(session),
      id,
      parsed.data.serialNumberId,
      parsed.data.remarks,
    );
    revalidateTransfer(id);
    return { success: true as const, ...result };
  } catch (error) {
    return actionError(error, "Failed to reject serial");
  }
}

export async function listPulloutsAction(input?: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  return logisticsRepository.listPullouts(
    session.user.tenantId,
    {
      page: input?.page,
      limit: parseTablePageSize(input?.limit),
    },
    { field: parsePulloutSort(input?.sort), dir: parseSortDir(input?.sortDir) },
  );
}

export async function getPulloutDetailAction(id: string) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  try {
    const detail = await pulloutPostingService.getDetail(postingActor(session), id);
    return { success: true as const, detail };
  } catch (error) {
    return actionError(error, "Pull-out not found");
  }
}

export async function listPulloutSerialsAction(branchId: string) {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  try {
    const serials = await pulloutPostingService.listSerials(postingActor(session), branchId);
    return { success: true as const, serials };
  } catch (error) {
    return actionError(error, "Failed to load serials");
  }
}

export interface PulloutChecklistOptions {
  classifications: { id: string; name: string }[];
  unitPackingConditions: { id: string; name: string }[];
  accessoryCompleteness: { id: string; name: string }[];
}

const EMPTY_CHECKLIST_OPTIONS: PulloutChecklistOptions = {
  classifications: [],
  unitPackingConditions: [],
  accessoryCompleteness: [],
};

/** Active pull-out checklist names for people who can create a pull-out. */
export async function listPulloutChecklistOptionsAction(): Promise<
  PulloutChecklistOptions & { error?: string }
> {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  const where = { tenantId: session.user.tenantId, recordStatus: "active" as const };
  const orderBy = { name: "asc" as const };
  const select = { id: true, name: true };
  try {
    const [classifications, unitPackingConditions, accessoryCompleteness] = await Promise.all([
      prisma.pulloutClassification.findMany({ where, orderBy, select }),
      prisma.unitPackingCondition.findMany({ where, orderBy, select }),
      prisma.accessoryCompleteness.findMany({ where, orderBy, select }),
    ]);
    return { classifications, unitPackingConditions, accessoryCompleteness };
  } catch (error) {
    return { ...EMPTY_CHECKLIST_OPTIONS, ...actionError(error, "Failed to load pull-out checklist options") };
  }
}

export async function createPulloutAction(input: unknown) {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  const parsed = pulloutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        "Choose a branch, warehouse, reason, and classification, packing, and accessories for each serial",
    };
  }
  try {
    const row = await pulloutPostingService.create(postingActor(session), parsed.data);
    revalidatePullout(row.id);
    return { success: true as const, id: row.id, pulloutNo: row.pulloutNo };
  } catch (error) {
    return actionError(error, "Failed to create pull-out");
  }
}

export async function approvePulloutTlAction(id: string) {
  const session = await requireAnyPermission([...TL_PERMISSIONS]);
  try {
    await pulloutPostingService.approve(postingActor(session), id);
    revalidatePullout(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to approve pull-out");
  }
}

export async function rejectPulloutAction(id: string) {
  const session = await requireAnyPermission([...TL_PERMISSIONS]);
  try {
    await pulloutPostingService.reject(postingActor(session), id);
    revalidatePullout(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to reject pull-out");
  }
}

export async function schedulePulloutAction(id: string) {
  const session = await requirePermission(LOGISTICS_MANAGE);
  try {
    await pulloutPostingService.updateList(postingActor(session), { pulloutId: id });
    revalidatePullout(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to save the pull-out list");
  }
}

export async function updatePulloutListAction(id: string, input: unknown) {
  const session = await requirePermission(LOGISTICS_MANAGE);
  const parsed = pulloutListSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose the warehouse and the serials on this list" };
  try {
    await pulloutPostingService.updateList(postingActor(session), {
      pulloutId: id,
      warehouseId: parsed.data.warehouseId,
      waybillNo: parsed.data.waybillNo,
      notes: parsed.data.notes,
      serialNumberIds: parsed.data.serialNumberIds,
    });
    revalidatePullout(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to save the pull-out list");
  }
}

export async function releasePulloutAction(id: string) {
  const session = await requirePermission(LOGISTICS_MANAGE);
  try {
    const result = await pulloutPostingService.finalize(postingActor(session), id);
    revalidatePullout(id);
    return { success: true as const, sapJob: result.sapJob };
  } catch (error) {
    return actionError(error, "Failed to send the pull-out");
  }
}

export async function completePulloutAction(id: string) {
  const session = await requirePermission(LOGISTICS_MANAGE);
  try {
    await pulloutPostingService.complete(postingActor(session), id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Warehouse receipt is not available yet. Units stay in transit.");
  }
}

export async function listBranchesForLogisticsAction() {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  return prisma.branch.findMany({
    where: { tenantId: session.user.tenantId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, dealerId: true },
  });
}

export async function listWarehousesForLogisticsAction() {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  return prisma.warehouse.findMany({
    where: { tenantId: session.user.tenantId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
}

export async function listPulloutReasonCodesAction() {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  return reasonStatusService.listActiveCodes(session.user.tenantId, "pullout_reason");
}


const DELIVERY_TRANSFER_PERMISSIONS = [
  LOGISTICS_DELIVERY_TRANSFER_CREATE,
  LOGISTICS_DELIVERY_TRANSFER_APPROVE,
  LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
] as const;
const DELIVERY_TRANSFER_VIEW_PERMISSIONS = [
  ...LOGISTICS_PAGE_PERMISSIONS,
  ...DELIVERY_TRANSFER_PERMISSIONS,
] as const;

function revalidateDeliveryTransfer(id: string) {
  revalidateLogisticsPaths();
  revalidatePath(`/logistics/delivery-transfers/${id}`);
  revalidatePath("/operations");
  revalidatePath("/inventory");
}

export async function listDeliveryTransfersAction(input?: { page?: number; limit?: number }) {
  const session = await requireAnyPermission([...DELIVERY_TRANSFER_VIEW_PERMISSIONS]);
  return deliveryTransferService.list(session.user.tenantId, {
    page: input?.page,
    limit: parseTablePageSize(input?.limit),
  });
}

export async function getDeliveryTransferDetailAction(id: string) {
  const session = await requireAnyPermission([...DELIVERY_TRANSFER_VIEW_PERMISSIONS]);
  try {
    const detail = await deliveryTransferService.getDetail(postingActor(session), id);
    return { success: true as const, detail };
  } catch (error) {
    return actionError(error, "Unit transfer not found");
  }
}

/** Places and defaults for the create dialog. */
export async function prepareDeliveryTransferAction(
  deliveryId: string,
  serialNumberIds: string[],
): Promise<
  { success: true; draft: DeliveryTransferDraft; createdByName: string } | { error: string }
> {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_TRANSFER_CREATE]);
  const parsed = z.array(z.string().min(1)).min(1).safeParse(serialNumberIds);
  if (!parsed.success) return { error: "Select the units to transfer" };
  try {
    const draft = await deliveryTransferService.prepare(postingActor(session), deliveryId, parsed.data);
    return { success: true as const, draft, createdByName: session.user.name || session.user.email || "You" };
  } catch (error) {
    return actionError(error, "Failed to load branches and warehouses");
  }
}

export async function createDeliveryTransferAction(input: unknown) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_TRANSFER_CREATE]);
  const parsed = deliveryTransferSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose branch release, branch receive, and the units to transfer" };
  try {
    const row = await deliveryTransferService.create(postingActor(session), parsed.data);
    revalidateDeliveryTransfer(row.id);
    return { success: true as const, id: row.id, transferNo: row.transferNo };
  } catch (error) {
    return actionError(error, "Failed to create the unit transfer");
  }
}

export async function updateDeliveryTransferLineRemarksAction(lineId: string, remarks: string) {
  const session = await requireAnyPermission([
    LOGISTICS_DELIVERY_TRANSFER_CREATE,
    LOGISTICS_DELIVERY_TRANSFER_APPROVE,
  ]);
  const parsed = z.string().max(500).safeParse(remarks);
  if (!parsed.success) return { error: "Remarks can be up to 500 characters" };
  try {
    const result = await deliveryTransferService.updateLineRemarks(postingActor(session), lineId, parsed.data);
    revalidatePath(`/logistics/delivery-transfers/${result.transferId}`);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to save remarks");
  }
}

export async function decideDeliveryTransferLineAction(lineId: string, action: unknown) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_TRANSFER_APPROVE]);
  const parsed = z.enum(["APPROVE", "REMOVE"]).safeParse(action);
  if (!parsed.success) return { error: "Invalid action" };
  try {
    const result = await deliveryTransferService.decideLine(postingActor(session), lineId, parsed.data);
    revalidateDeliveryTransfer(result.transferId);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to update the transfer line");
  }
}

export async function releaseDeliveryTransferAction(id: string) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_TRANSFER_APPROVE]);
  try {
    const result = await deliveryTransferService.release(postingActor(session), id);
    revalidateDeliveryTransfer(id);
    return { success: true as const, ...result };
  } catch (error) {
    return actionError(error, "Failed to release the transfer");
  }
}

export async function retryDeliveryTransferSapAction(id: string) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_TRANSFER_APPROVE]);
  try {
    const result = await deliveryTransferService.retrySap(postingActor(session), id);
    revalidateDeliveryTransfer(id);
    return { success: true as const, ...result };
  } catch (error) {
    return actionError(error, "Failed to retry the SAP posting");
  }
}

export async function cancelDeliveryTransferAction(id: string) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_TRANSFER_APPROVE]);
  try {
    await deliveryTransferService.cancelInTransit(postingActor(session), id);
    revalidateDeliveryTransfer(id);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to cancel the transfer");
  }
}

export async function receiveDeliveryTransferLineAction(lineId: string) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_TRANSFER_RECEIVE]);
  try {
    const result = await deliveryTransferService.receiveLine(postingActor(session), lineId);
    revalidateDeliveryTransfer(result.transferId);
    return { success: true as const, status: result.status };
  } catch (error) {
    return actionError(error, "Failed to receive the unit");
  }
}

const DELIVERY_RETURN_PERMISSIONS = [
  LOGISTICS_DELIVERY_RETURN_REQUEST,
  LOGISTICS_DELIVERY_RETURN_APPROVE,
] as const;

function revalidateDeliveryReturn() {
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  revalidatePath("/inventory");
}

export async function requestDeliveryReturnAction(deliveryId: string, reason: unknown, serialNumberIds?: unknown) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_RETURN_REQUEST]);
  const parsed = deliveryReturnReasonSchema.safeParse(reason);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter the reason for the return" };
  const units = deliveryReturnSerialIdsSchema.safeParse(serialNumberIds);
  if (!units.success) return { error: units.error.issues[0]?.message ?? "Tick the units to return" };
  try {
    const row = await deliveryReturnService.request(postingActor(session), { deliveryId, reason: parsed.data, serialNumberIds: units.data });
    revalidateDelivery(deliveryId);
    return { success: true as const, id: row.id, requestNo: row.requestNo };
  } catch (error) {
    return actionError(error, "Failed to request the return");
  }
}

export async function getDeliveryReturnAction(
  deliveryId: string,
): Promise<{ success: true; detail: DeliveryReturnDetail | null } | { error: string }> {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS, ...DELIVERY_RETURN_PERMISSIONS]);
  try {
    const detail = await deliveryReturnService.getLatestForDelivery(postingActor(session), deliveryId);
    return { success: true as const, detail };
  } catch (error) {
    return actionError(error, "Failed to load the return request");
  }
}

export async function decideDeliveryReturnAction(returnId: string, input: unknown) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_RETURN_APPROVE]);
  const parsed = deliveryReturnDecisionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const outcome = await deliveryReturnService.decide(
      postingActor(session),
      returnId,
      parsed.data.action,
      parsed.data.note,
    );
    revalidateDeliveryReturn();
    return { success: true as const, ...outcome };
  } catch (error) {
    return actionError(error, "Failed to decide the return request");
  }
}

export async function cancelDeliveryReturnAction(returnId: string, note: unknown) {
  const session = await requireAnyPermission([LOGISTICS_DELIVERY_RETURN_APPROVE]);
  const parsed = deliveryReturnCancelNoteSchema.safeParse(note);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter the reason for cancelling the return" };
  try {
    const outcome = await deliveryReturnService.cancelApproved(postingActor(session), returnId, parsed.data);
    revalidateDeliveryReturn();
    return { success: true as const, ...outcome };
  } catch (error) {
    return actionError(error, "Failed to cancel the return");
  }
}

export async function retryDeliveryReturnSapAction(returnId: string) {
  const session = await requireAnyPermission([...DELIVERY_RETURN_PERMISSIONS]);
  try {
    const outcome = await deliveryReturnService.retrySap(postingActor(session), returnId);
    revalidateDeliveryReturn();
    return { success: true as const, ...outcome };
  } catch (error) {
    return actionError(error, "Failed to retry the SAP posting");
  }
}
