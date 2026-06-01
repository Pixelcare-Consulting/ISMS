"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditService } from "@/features/audit/services/audit.service";
import { logisticsRepository } from "@/features/logistics/repositories/logistics.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

const deliverySchema = z.object({ branchId: z.string().min(1) });
const transferSchema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
});
const pulloutSchema = z.object({
  branchId: z.string().min(1),
  warehouseId: z.string().min(1),
  reasonStatusCodeId: z.string().optional(),
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

export async function listDeliveriesAction(input?: { page?: number }) {
  const session = await requireAnyPermission(["logistics.manage", "orders.create", "orders.view"]);
  return logisticsRepository.listDeliveries(session.user.tenantId, {
    page: input?.page,
  });
}

export async function createDeliveryAction(input: unknown) {
  const session = await requirePermission("logistics.manage");
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "delivery_workflow",
    "pending",
  );

  const row = await prisma.branchDelivery.create({
    data: {
      tenantId: session.user.tenantId,
      branchId: parsed.data.branchId,
      deliveryNo: nextNo("DLV"),
      statusCodeId,
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "delivery.created",
    entityType: "BranchDelivery",
    entityId: row.id,
  });

  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function acceptDeliveryAction(id: string) {
  const session = await requireAnyPermission(["logistics.manage", "orders.create"]);
  const acceptedCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "delivery_workflow",
    "accepted",
  );
  const ditCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "DIT",
  );
  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const row = await prisma.branchDelivery.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId: acceptedCodeId, acceptedAt: new Date() },
  });

  await prisma.branchInventory.updateMany({
    where: {
      tenantId: session.user.tenantId,
      branchId: row.branchId,
      statusCodeId: ditCodeId,
    },
    data: { statusCodeId: stkCodeId, updatedById: session.user.id },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "delivery.accepted",
    entityType: "BranchDelivery",
    entityId: id,
  });

  revalidateLogisticsPaths();
  revalidatePath("/inventory");
  revalidatePath("/operations");
  return { success: true as const };
}

export async function listTransfersAction(input?: { page?: number }) {
  const session = await requireAnyPermission(["logistics.manage", "orders.create", "orders.view"]);
  return logisticsRepository.listTransfers(session.user.tenantId, {
    page: input?.page,
  });
}

export async function createTransferAction(input: unknown) {
  const session = await requirePermission("orders.create");
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "transfer_workflow",
    "pending_tl",
  );

  const row = await prisma.branchTransfer.create({
    data: {
      tenantId: session.user.tenantId,
      fromBranchId: parsed.data.fromBranchId,
      toBranchId: parsed.data.toBranchId,
      transferNo: nextNo("XFR"),
      statusCodeId,
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "transfer.created",
    entityType: "BranchTransfer",
    entityId: row.id,
  });

  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function approveTransferAction(id: string) {
  const session = await requirePermission("orders.approve");
  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "transfer_workflow",
    "for_transfer",
  );
  await prisma.branchTransfer.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId },
  });
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function executeTransferAction(id: string) {
  const session = await requirePermission("logistics.manage");
  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "transfer_workflow",
    "in_transit",
  );
  await prisma.branchTransfer.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId },
  });
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function receiveTransferAction(id: string) {
  const session = await requirePermission("orders.create");
  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "transfer_workflow",
    "completed",
  );
  await prisma.branchTransfer.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId },
  });
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function listPulloutsAction(input?: { page?: number }) {
  const session = await requireAnyPermission(["logistics.manage", "orders.create", "orders.view"]);
  return logisticsRepository.listPullouts(session.user.tenantId, {
    page: input?.page,
  });
}

export async function createPulloutAction(input: unknown) {
  const session = await requirePermission("orders.create");
  const parsed = pulloutSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "pullout_workflow",
    "pending_tl",
  );

  let reasonStatusId: string | undefined;
  if (parsed.data.reasonStatusCodeId) {
    const reasonCode = await prisma.reasonStatusCode.findFirst({
      where: {
        id: parsed.data.reasonStatusCodeId,
        tenantId: session.user.tenantId,
        reasonStatus: { category: "pullout_reason" },
      },
      select: { id: true, reasonStatusId: true },
    });
    if (!reasonCode) return { error: "Invalid pull-out reason" };
    reasonStatusId = reasonCode.reasonStatusId;
  }

  const row = await prisma.branchPullout.create({
    data: {
      tenantId: session.user.tenantId,
      branchId: parsed.data.branchId,
      warehouseId: parsed.data.warehouseId,
      pulloutNo: nextNo("PLT"),
      statusCodeId,
      reasonStatusId: reasonStatusId ?? null,
      reasonStatusCodeId: parsed.data.reasonStatusCodeId ?? null,
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "pullout.created",
    entityType: "BranchPullout",
    entityId: row.id,
  });

  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function approvePulloutTlAction(id: string) {
  const session = await requirePermission("orders.approve");
  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "pullout_workflow",
    "for_pullout",
  );
  await prisma.branchPullout.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId },
  });
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function schedulePulloutAction(id: string) {
  const session = await requirePermission("logistics.manage");
  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "pullout_workflow",
    "pending_logistics",
  );
  await prisma.branchPullout.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId },
  });
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function releasePulloutAction(id: string) {
  const session = await requirePermission("orders.create");
  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "pullout_workflow",
    "in_transit",
  );
  await prisma.branchPullout.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId },
  });
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function completePulloutAction(id: string) {
  const session = await requirePermission("logistics.manage");
  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "pullout_workflow",
    "completed",
  );
  await prisma.branchPullout.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId },
  });
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function listBranchesForLogisticsAction() {
  const session = await requireAnyPermission(["logistics.manage", "orders.create"]);
  return prisma.branch.findMany({
    where: { tenantId: session.user.tenantId, deletedAt: null },
    orderBy: { name: "asc" },
  });
}

export async function listWarehousesForLogisticsAction() {
  const session = await requireAnyPermission(["logistics.manage", "orders.create"]);
  return prisma.warehouse.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });
}

export async function listPulloutReasonCodesAction() {
  const session = await requireAnyPermission(["logistics.manage", "orders.create"]);
  return reasonStatusService.listActiveCodes(session.user.tenantId, "pullout_reason");
}

