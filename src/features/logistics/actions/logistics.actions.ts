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
  serialNumberIds: z.array(z.string().min(1)).optional(),
});
const pulloutSchema = z.object({
  branchId: z.string().min(1),
  warehouseId: z.string().min(1),
  reasonStatusCodeId: z.string().optional(),
  serialNumberIds: z.array(z.string().min(1)).optional(),
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

async function requireFirstCodeId(
  tenantId: string,
  category: "transfer_workflow" | "pullout_workflow" | "delivery_workflow",
  codes: string[],
) {
  for (const code of codes) {
    const row = await prisma.reasonStatusCode.findFirst({
      where: {
        tenantId,
        code,
        reasonStatus: { category },
      },
      select: { id: true },
    });
    if (row) return row.id;
  }
  throw new Error(`Status code not configured: ${category}/${codes[0]}`);
}

async function updateInventoryStatusForSerials(input: {
  tenantId: string;
  branchId: string;
  serialNumberIds: string[];
  statusCodeId: string;
  userId: string;
  requiredCurrentCodeId?: string;
}) {
  const where = {
    tenantId: input.tenantId,
    branchId: input.branchId,
    serialNumberId: { in: input.serialNumberIds },
    ...(input.requiredCurrentCodeId ? { statusCodeId: input.requiredCurrentCodeId } : {}),
  };

  const updated = await prisma.branchInventory.updateMany({
    where,
    data: { statusCodeId: input.statusCodeId, updatedById: input.userId },
  });

  if (updated.count !== input.serialNumberIds.length) {
    throw new Error("One or more serial numbers are not available at the branch");
  }
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

export async function acceptDeliveryAction(id: string, input?: unknown) {
  const session = await requireAnyPermission(["logistics.manage", "orders.create"]);
  const parsed = input
    ? z.object({ serialNumberIds: z.array(z.string().min(1)).optional() }).safeParse(input)
    : { success: true as const, data: {} };
  if (!parsed.success) return { error: "Invalid input" };

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

  const serialNumberIds = parsed.data.serialNumberIds;
  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const delivery = await tx.branchDelivery.update({
        where: { id, tenantId: session.user.tenantId },
        data: { statusCodeId: acceptedCodeId, acceptedAt: new Date() },
        include: {
          branch: { select: { name: true } },
          order: { select: { orderNumber: true } },
        },
      });

      const moved = await tx.branchInventory.updateMany({
        where: {
          tenantId: session.user.tenantId,
          branchId: delivery.branchId,
          statusCodeId: ditCodeId,
          ...(serialNumberIds?.length ? { serialNumberId: { in: serialNumberIds } } : {}),
        },
        data: { statusCodeId: stkCodeId, updatedById: session.user.id },
      });

      if (serialNumberIds?.length && moved.count !== serialNumberIds.length) {
        throw new Error("Some serials are not in-transit at this branch");
      }
      if (!serialNumberIds?.length && moved.count === 0) {
        throw new Error("No in-transit inventory found for this delivery");
      }

      return delivery;
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to accept delivery" };
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "delivery.accepted",
    entityType: "BranchDelivery",
    entityId: id,
    metadata: {
      deliveryNo: row.deliveryNo,
      branchName: row.branch.name,
      ...(parsed.data.serialNumberIds?.length
        ? { serialCount: parsed.data.serialNumberIds.length }
        : {}),
      ...(row.order ? { orderNumber: row.order.orderNumber } : {}),
    },
  });

  revalidateLogisticsPaths();
  revalidatePath("/inventory");
  revalidatePath("/operations");
  return { success: true as const };
}

export async function rejectDeliveryAction(id: string, notes?: string) {
  const session = await requireAnyPermission(["logistics.manage", "orders.create"]);
  const rejectedCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "delivery_workflow",
    "rejected",
  );

  const row = await prisma.branchDelivery.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId: rejectedCodeId },
    include: {
      branch: { select: { name: true } },
      order: { select: { orderNumber: true } },
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "delivery.rejected",
    entityType: "BranchDelivery",
    entityId: id,
    metadata: {
      deliveryNo: row.deliveryNo,
      branchName: row.branch.name,
      ...(row.order ? { orderNumber: row.order.orderNumber } : {}),
      ...(notes ? { notes } : {}),
    },
  });

  revalidateLogisticsPaths();
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

  const statusCodeId = await requireFirstCodeId(session.user.tenantId, "transfer_workflow", [
    "requested",
    "pending_tl",
  ]);

  const serialIds = parsed.data.serialNumberIds ?? [];
  if (serialIds.length > 0) {
    const stkCodeId = await reasonStatusService.requireCodeId(
      session.user.tenantId,
      "inventory_system",
      "STK",
    );
    const validCount = await prisma.branchInventory.count({
      where: {
        tenantId: session.user.tenantId,
        branchId: parsed.data.fromBranchId,
        serialNumberId: { in: serialIds },
        statusCodeId: stkCodeId,
      },
    });
    if (validCount !== serialIds.length) {
      return { error: "One or more serial numbers are not available at the source branch" };
    }
  }

  const row = await prisma.branchTransfer.create({
    data: {
      tenantId: session.user.tenantId,
      fromBranchId: parsed.data.fromBranchId,
      toBranchId: parsed.data.toBranchId,
      transferNo: nextNo("XFR"),
      statusCodeId,
      ...(serialIds.length
        ? {
            lines: {
              create: serialIds.map((serialNumberId) => ({ serialNumberId })),
            },
          }
        : {}),
    },
    include: {
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "transfer.created",
    entityType: "BranchTransfer",
    entityId: row.id,
    metadata: {
      transferNo: row.transferNo,
      from: row.fromBranch.name,
      to: row.toBranch.name,
    },
  });

  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function approveTransferAction(id: string) {
  const session = await requirePermission("orders.approve");
  const statusCodeId = await requireFirstCodeId(session.user.tenantId, "transfer_workflow", [
    "approved",
    "for_transfer",
  ]);
  await prisma.branchTransfer.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId },
  });
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function rejectTransferAction(id: string) {
  const session = await requirePermission("orders.approve");
  const statusCodeId = await requireFirstCodeId(session.user.tenantId, "transfer_workflow", [
    "rejected",
    "cancelled",
  ]);
  await prisma.branchTransfer.update({
    where: { id, tenantId: session.user.tenantId },
    data: { statusCodeId },
  });
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  return { success: true as const };
}

export async function executeTransferAction(id: string, input?: unknown) {
  const session = await requirePermission("logistics.manage");
  const parsed = input ? serialIdsSchema.safeParse(input) : null;
  if (parsed && !parsed.success) return { error: "Select at least one serial number" };

  const transfer = await prisma.branchTransfer.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: { lines: true },
  });
  if (!transfer) return { error: "Transfer not found" };

  const statusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "transfer_workflow",
    "in_transit",
  );
  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );
  const ditCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "DIT",
  );

  const serialNumberIds =
    parsed?.data.serialNumberIds ?? transfer.lines.map((l) => l.serialNumberId);
  if (serialNumberIds.length === 0) {
    return { error: "Select serial numbers to transfer" };
  }

  try {
    if (parsed?.data.serialNumberIds) {
      await prisma.branchTransferLine.createMany({
        data: parsed.data.serialNumberIds.map((serialNumberId) => ({
          transferId: id,
          serialNumberId,
        })),
        skipDuplicates: true,
      });
    }

    await updateInventoryStatusForSerials({
      tenantId: session.user.tenantId,
      branchId: transfer.fromBranchId,
      serialNumberIds,
      statusCodeId: ditCodeId,
      userId: session.user.id,
      requiredCurrentCodeId: stkCodeId,
    });

    await prisma.branchTransfer.update({
      where: { id },
      data: { statusCodeId },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to execute transfer" };
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "transfer.executed",
    entityType: "BranchTransfer",
    entityId: id,
    metadata: { transferNo: transfer.transferNo, serialCount: serialNumberIds.length },
  });

  revalidateLogisticsPaths();
  revalidatePath("/operations");
  revalidatePath("/inventory");
  return { success: true as const };
}

export async function receiveTransferAction(id: string) {
  const session = await requirePermission("orders.create");
  const statusCodeId = await requireFirstCodeId(session.user.tenantId, "transfer_workflow", [
    "accepted",
    "completed",
  ]);

  const transfer = await prisma.branchTransfer.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: { lines: true },
  });
  if (!transfer) return { error: "Transfer not found" };
  if (transfer.lines.length === 0) return { error: "No transfer lines to receive" };

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );
  const ditCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "DIT",
  );

  const serialNumberIds = transfer.lines.map((l) => l.serialNumberId);

  try {
    await prisma.$transaction(async (tx) => {
      const moved = await tx.branchInventory.updateMany({
        where: {
          tenantId: session.user.tenantId,
          branchId: transfer.fromBranchId,
          serialNumberId: { in: serialNumberIds },
          statusCodeId: ditCodeId,
        },
        data: {
          branchId: transfer.toBranchId,
          statusCodeId: stkCodeId,
          updatedById: session.user.id,
        },
      });

      if (moved.count !== serialNumberIds.length) {
        throw new Error("Some transfer serials are not in-transit from the source branch");
      }

      await tx.branchTransfer.update({
        where: { id },
        data: { statusCodeId },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to receive transfer" };
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "transfer.received",
    entityType: "BranchTransfer",
    entityId: id,
    metadata: { transferNo: transfer.transferNo, serialCount: serialNumberIds.length },
  });

  revalidateLogisticsPaths();
  revalidatePath("/operations");
  revalidatePath("/inventory");
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
  let reasonName: string | undefined;
  if (parsed.data.reasonStatusCodeId) {
    const reasonCode = await prisma.reasonStatusCode.findFirst({
      where: {
        id: parsed.data.reasonStatusCodeId,
        tenantId: session.user.tenantId,
        reasonStatus: { category: "pullout_reason" },
      },
      select: { id: true, reasonStatusId: true, name: true },
    });
    if (!reasonCode) return { error: "Invalid pull-out reason" };
    reasonStatusId = reasonCode.reasonStatusId;
    reasonName = reasonCode.name;
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
      ...(parsed.data.serialNumberIds?.length
        ? {
            lines: {
              create: parsed.data.serialNumberIds.map((serialNumberId) => ({
                serialNumberId,
              })),
            },
          }
        : {}),
    },
    include: { branch: { select: { name: true } }, lines: true },
  });

  if (parsed.data.serialNumberIds?.length) {
    const stkCodeId = await reasonStatusService.requireCodeId(
      session.user.tenantId,
      "inventory_system",
      "STK",
    );
    const rsvCodeId = await reasonStatusService.requireCodeId(
      session.user.tenantId,
      "inventory_system",
      "RSV",
    );
    try {
      await updateInventoryStatusForSerials({
        tenantId: session.user.tenantId,
        branchId: parsed.data.branchId,
        serialNumberIds: parsed.data.serialNumberIds,
        statusCodeId: rsvCodeId,
        userId: session.user.id,
        requiredCurrentCodeId: stkCodeId,
      });
    } catch (e) {
      await prisma.branchPullout.delete({ where: { id: row.id } });
      return { error: e instanceof Error ? e.message : "Serial not available" };
    }
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "pullout.created",
    entityType: "BranchPullout",
    entityId: row.id,
    metadata: {
      pulloutNo: row.pulloutNo,
      branchName: row.branch.name,
      ...(reasonName ? { reasonName } : {}),
      ...(parsed.data.serialNumberIds?.length
        ? { serialCount: parsed.data.serialNumberIds.length }
        : {}),
    },
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
  const pullout = await prisma.branchPullout.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: { lines: true },
  });
  if (!pullout) return { error: "Pull-out not found" };

  if (pullout.lines.length > 0) {
    const rsvCodeId = await reasonStatusService.requireCodeId(
      session.user.tenantId,
      "inventory_system",
      "RSV",
    );
    const fpoCodeId = await reasonStatusService.requireCodeId(
      session.user.tenantId,
      "inventory_system",
      "FPO",
    );
    await updateInventoryStatusForSerials({
      tenantId: session.user.tenantId,
      branchId: pullout.branchId,
      serialNumberIds: pullout.lines.map((l) => l.serialNumberId),
      statusCodeId: fpoCodeId,
      userId: session.user.id,
      requiredCurrentCodeId: rsvCodeId,
    });
  }

  await prisma.branchPullout.update({
    where: { id },
    data: { statusCodeId },
  });
  revalidateLogisticsPaths();
  revalidatePath("/operations");
  revalidatePath("/inventory");
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
  const pullout = await prisma.branchPullout.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: { lines: true },
  });
  if (!pullout) return { error: "Pull-out not found" };

  if (pullout.lines.length > 0) {
    await prisma.branchInventory.deleteMany({
      where: {
        tenantId: session.user.tenantId,
        branchId: pullout.branchId,
        serialNumberId: { in: pullout.lines.map((l) => l.serialNumberId) },
      },
    });
  }

  await prisma.branchPullout.update({
    where: { id },
    data: { statusCodeId },
  });

  const { sapService } = await import("@/features/sap/services/sap.service");
  await sapService.emitPulloutItr(session.user.tenantId, {
    id: pullout.id,
    pulloutNo: pullout.pulloutNo,
    branchId: pullout.branchId,
    warehouseId: pullout.warehouseId,
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "pullout.completed",
    entityType: "BranchPullout",
    entityId: id,
    metadata: {
      pulloutNo: pullout.pulloutNo,
      ...(pullout.lines.length ? { serialCount: pullout.lines.length } : {}),
    },
  });

  revalidateLogisticsPaths();
  revalidatePath("/operations");
  revalidatePath("/inventory");
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

export async function listBranchStockSerialsAction(branchId: string) {
  const session = await requireAnyPermission(["logistics.manage", "orders.create"]);
  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );
  const rows = await prisma.branchInventory.findMany({
    where: {
      tenantId: session.user.tenantId,
      branchId,
      statusCodeId: stkCodeId,
    },
    include: {
      serialNumber: {
        include: { model: { select: { skuCode: true, name: true } } },
      },
    },
    orderBy: { serialNumber: { serialNo: "asc" } },
    take: 200,
  });
  return rows.map((r) => ({
    serialNumberId: r.serialNumberId,
    serialNo: r.serialNumber.serialNo,
    skuCode: r.serialNumber.model.skuCode,
    modelName: r.serialNumber.model.name,
  }));
}

