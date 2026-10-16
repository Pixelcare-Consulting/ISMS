"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditService } from "@/features/audit/services/audit.service";
import {
  LOGISTICS_CREATE,
  LOGISTICS_MANAGE,
  LOGISTICS_PAGE_PERMISSIONS,
} from "@/features/logistics/constants/logistics-permissions";
import { logisticsRepository } from "@/features/logistics/repositories/logistics.repository";
import { deliveryPostingService } from "@/features/logistics/services/delivery-posting.service";
import { pulloutPostingService } from "@/features/logistics/services/pullout-posting.service";
import { transferPostingService } from "@/features/logistics/services/transfer-posting.service";
import type { PostingActor } from "@/features/logistics/services/posting-support";
import type {
  DeliveryListSort,
  LogisticsListSortDir,
  PulloutListSort,
  TransferListSort,
} from "@/features/logistics/repositories/logistics.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

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
});
const pulloutSchema = z.object({
  branchId: z.string().min(1),
  warehouseId: z.string().min(1),
  reasonStatusCodeId: z.string().min(1),
  serialNumberIds: z.array(z.string().min(1)).min(1),
  notes: z.string().optional(),
});
const pulloutListSchema = z.object({
  warehouseId: z.string().min(1),
  waybillNo: z.string().optional(),
  notes: z.string().optional(),
  serialNumberIds: z.array(z.string().min(1)).min(1),
});

const serialIdsSchema = z.object({
  serialNumberIds: z.array(z.string().min(1)).min(1),
});

function nextNo(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function revalidateLogisticsPaths() {
  revalidatePath("/logistics");
  revalidatePath("/logistics/deliveries");
  revalidatePath("/logistics/transfers");
  revalidatePath("/logistics/pickups");
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
  statuses: { code: string; name: string; count: number }[];
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
    statuses: codes.map((c) => ({ code: c.code, name: c.name, count: countByCodeId.get(c.id) ?? 0 })),
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
  return buildLogisticsKpis(
    tid,
    "transfer_workflow",
    () => logisticsRepository.countTransfersByStatus(tid),
    () => logisticsRepository.countAllTransfers(tid),
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

export async function createDeliveryAction(input: unknown) {
  const session = await requireAnyPermission([LOGISTICS_CREATE, LOGISTICS_MANAGE]);
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "delivery_workflow",
    "approved",
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

export async function listDispatchCandidatesAction(id: string) {
  const session = await requirePermission(LOGISTICS_MANAGE);
  try {
    const result = await deliveryPostingService.listDispatchCandidates(session.user.tenantId, id);
    return { success: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load warehouse serials" };
  }
}

export async function dispatchDeliveryAction(id: string, input: unknown) {
  const session = await requirePermission(LOGISTICS_MANAGE);
  const parsed = serialIdsSchema.safeParse(input);
  if (!parsed.success) return { error: "Select the serials to dispatch" };

  try {
    const result = await deliveryPostingService.dispatch({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      deliveryId: id,
      serialNumberIds: parsed.data.serialNumberIds,
    });
    revalidateLogisticsPaths();
    revalidatePath("/inventory");
    revalidatePath("/operations");
    return { success: true as const, movedCount: result.movedCount };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to dispatch delivery" };
  }
}

export async function acceptDeliveryAction(id: string, input?: unknown) {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  const parsed = input
    ? z.object({ serialNumberIds: z.array(z.string().min(1)).optional() }).safeParse(input)
    : { success: true as const, data: {} };
  if (!parsed.success) return { error: "Invalid input" };

  try {
    const result = await deliveryPostingService.accept({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      deliveryId: id,
      serialNumberIds: parsed.data.serialNumberIds,
    });
    revalidateLogisticsPaths();
    revalidatePath("/inventory");
    revalidatePath("/operations");
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

export async function rejectDeliveryAction(id: string, notes?: string) {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  try {
    const result = await deliveryPostingService.reject({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      deliveryId: id,
      notes,
    });
    revalidateLogisticsPaths();
    revalidatePath("/inventory");
    revalidatePath("/operations");
    return { success: true as const, returnedCount: result.returnedCount };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reject delivery" };
  }
}

export async function listTransfersAction(input?: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  return logisticsRepository.listTransfers(
    session.user.tenantId,
    {
      page: input?.page,
      limit: parseTablePageSize(input?.limit),
    },
    { field: parseTransferSort(input?.sort), dir: parseSortDir(input?.sortDir) },
  );
}

const TL_PERMISSIONS = ["orders.approve", LOGISTICS_MANAGE] as const;

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
    await transferPostingService.approve(postingActor(session), id);
    revalidateTransfer(id);
    return { success: true as const };
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
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
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

export async function createPulloutAction(input: unknown) {
  const session = await requireAnyPermission([...LOGISTICS_WRITE_ALIASES]);
  const parsed = pulloutSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a branch, warehouse, reason, and serials" };
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
    select: { id: true, name: true },
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

