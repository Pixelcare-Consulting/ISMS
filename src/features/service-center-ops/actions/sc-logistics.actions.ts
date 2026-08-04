"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditService } from "@/features/audit/services/audit.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  SC_LOGISTICS_CREATE,
  SC_LOGISTICS_MANAGE,
  SC_LOGISTICS_VIEW,
  SC_ORDERS_APPROVE,
} from "@/features/service-center-ops/constants/sc-permissions";
import { scOpsRepository } from "@/features/service-center-ops/repositories/sc-ops.repository";
import {
  assertScInScope,
  resolveScIdsForUser,
} from "@/features/service-center-ops/services/sc-scope";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

function revalidateScLogistics() {
  revalidatePath("/service-centers/deliveries");
  revalidatePath("/service-centers/pullouts");
  revalidatePath("/service-centers/orders");
  revalidatePath("/service-centers/inventory");
}

function nextNo(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export async function listScDeliveriesAction(input?: {
  page?: number;
  limit?: number;
}) {
  const session = await requireAnyPermission([
    SC_LOGISTICS_VIEW,
    SC_LOGISTICS_CREATE,
    SC_LOGISTICS_MANAGE,
  ]);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  return scOpsRepository.listDeliveries(session.user.tenantId, scopedIds, {
    page: input?.page,
    limit: parseTablePageSize(input?.limit),
  });
}

export async function createScDeliveryFromOrderAction(orderId: string) {
  const session = await requireAnyPermission([
    SC_LOGISTICS_CREATE,
    SC_LOGISTICS_MANAGE,
  ]);
  const order = await prisma.serviceCenterOrder.findFirst({
    where: { id: orderId, tenantId: session.user.tenantId },
    include: { deliveries: { select: { id: true } } },
  });
  if (!order) return { error: "Order not found" as const };
  if (order.status !== "approved") {
    return { error: "Order must be approved before creating a delivery" as const };
  }

  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  try {
    assertScInScope(order.serviceCenterId, scopedIds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Out of scope" as const };
  }

  let pendingCodeId: string;
  try {
    pendingCodeId = await reasonStatusService.requireCodeId(
      session.user.tenantId,
      "delivery_workflow",
      "pending",
    );
  } catch {
    pendingCodeId = await reasonStatusService.requireCodeId(
      session.user.tenantId,
      "delivery_workflow",
      "in_transit",
    );
  }

  const deliveryNo = nextNo("SCD");
  const delivery = await prisma.serviceCenterDelivery.create({
    data: {
      tenantId: session.user.tenantId,
      serviceCenterId: order.serviceCenterId,
      serviceCenterLocationId: order.serviceCenterLocationId,
      orderId: order.id,
      deliveryNo,
      statusCodeId: pendingCodeId,
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_delivery.created",
    entityType: "ServiceCenterDelivery",
    entityId: delivery.id,
    metadata: { deliveryNo, orderNumber: order.orderNumber },
  });

  revalidateScLogistics();
  return { success: true as const, id: delivery.id, deliveryNo };
}

export async function acceptScDeliveryAction(
  deliveryId: string,
  input: unknown,
) {
  const session = await requireAnyPermission([
    SC_LOGISTICS_CREATE,
    SC_LOGISTICS_MANAGE,
  ]);
  const parsed = z
    .object({
      serialNumberIds: z.array(z.string().min(1)).min(1),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { error: "Provide at least one serial number" as const };
  }

  const delivery = await prisma.serviceCenterDelivery.findFirst({
    where: { id: deliveryId, tenantId: session.user.tenantId },
  });
  if (!delivery) return { error: "Delivery not found" as const };
  if (!delivery.serviceCenterLocationId) {
    return { error: "Delivery has no service center location" as const };
  }

  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  try {
    assertScInScope(delivery.serviceCenterId, scopedIds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Out of scope" as const };
  }

  const serials = await prisma.serialNumber.findMany({
    where: {
      id: { in: parsed.data.serialNumberIds },
      tenantId: session.user.tenantId,
    },
    select: { id: true },
  });
  if (serials.length !== parsed.data.serialNumberIds.length) {
    return { error: "One or more serials not found" as const };
  }

  const acceptedCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "delivery_workflow",
    "accepted",
  );
  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  try {
    await prisma.$transaction(async (tx) => {
      for (const serialNumberId of parsed.data.serialNumberIds) {
        await tx.serviceBackload.create({
          data: {
            tenantId: session.user.tenantId,
            serviceCenterId: delivery.serviceCenterId,
            serviceCenterLocationId: delivery.serviceCenterLocationId,
            deliveryId: delivery.id,
            serialNumberId,
          },
        });
        await tx.serviceCenterInventory.upsert({
          where: {
            serviceCenterLocationId_serialNumberId: {
              serviceCenterLocationId: delivery.serviceCenterLocationId!,
              serialNumberId,
            },
          },
          update: {
            statusCodeId: stkCodeId,
            serviceCenterId: delivery.serviceCenterId,
          },
          create: {
            tenantId: session.user.tenantId,
            serviceCenterId: delivery.serviceCenterId,
            serviceCenterLocationId: delivery.serviceCenterLocationId!,
            serialNumberId,
            statusCodeId: stkCodeId,
          },
        });
      }
      await tx.serviceCenterDelivery.update({
        where: { id: deliveryId },
        data: { statusCodeId: acceptedCodeId },
      });
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to accept delivery",
    } as const;
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_delivery.accepted",
    entityType: "ServiceCenterDelivery",
    entityId: deliveryId,
    metadata: {
      deliveryNo: delivery.deliveryNo,
      serialCount: parsed.data.serialNumberIds.length,
    },
  });

  revalidateScLogistics();
  return {
    success: true as const,
    movedCount: parsed.data.serialNumberIds.length,
  };
}

export async function listScPulloutsAction(input?: {
  page?: number;
  limit?: number;
}) {
  const session = await requireAnyPermission([
    SC_LOGISTICS_VIEW,
    SC_LOGISTICS_CREATE,
    SC_LOGISTICS_MANAGE,
  ]);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  return scOpsRepository.listPullouts(session.user.tenantId, scopedIds, {
    page: input?.page,
    limit: parseTablePageSize(input?.limit),
  });
}

export async function createScPulloutAction(input: unknown) {
  const session = await requireAnyPermission([
    SC_LOGISTICS_CREATE,
    SC_LOGISTICS_MANAGE,
  ]);
  const parsed = z
    .object({
      serviceCenterId: z.string().min(1),
      serviceCenterLocationId: z.string().min(1),
      serialNumberIds: z.array(z.string().min(1)).min(1),
      notes: z.string().max(500).optional().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid input" as const };

  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  try {
    assertScInScope(parsed.data.serviceCenterId, scopedIds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Out of scope" as const };
  }

  const pendingCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "pullout_workflow",
    "pending_tl",
  );
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

  const validCount = await prisma.serviceCenterInventory.count({
    where: {
      tenantId: session.user.tenantId,
      serviceCenterId: parsed.data.serviceCenterId,
      serviceCenterLocationId: parsed.data.serviceCenterLocationId,
      serialNumberId: { in: parsed.data.serialNumberIds },
      statusCodeId: stkCodeId,
    },
  });
  if (validCount !== parsed.data.serialNumberIds.length) {
    return {
      error: "One or more serials are not STK at this service center location",
    } as const;
  }

  const pulloutNo = nextNo("SCP");
  try {
    const pullout = await prisma.$transaction(async (tx) => {
      const moved = await tx.serviceCenterInventory.updateMany({
        where: {
          tenantId: session.user.tenantId,
          serviceCenterId: parsed.data.serviceCenterId,
          serviceCenterLocationId: parsed.data.serviceCenterLocationId,
          serialNumberId: { in: parsed.data.serialNumberIds },
          statusCodeId: stkCodeId,
        },
        data: { statusCodeId: rsvCodeId },
      });
      if (moved.count !== parsed.data.serialNumberIds.length) {
        throw new Error("Serial status changed; retry pull-out");
      }

      return tx.serviceCenterPullout.create({
        data: {
          tenantId: session.user.tenantId,
          serviceCenterId: parsed.data.serviceCenterId,
          serviceCenterLocationId: parsed.data.serviceCenterLocationId,
          pulloutNo,
          statusCodeId: pendingCodeId,
          notes: parsed.data.notes?.trim() || null,
          details: {
            create: parsed.data.serialNumberIds.map((serialNumberId) => ({
              serialNumberId,
            })),
          },
          approvalLevels: {
            create: [{ level: 1, roleSlug: "tl" }],
          },
        },
      });
    });

    await auditService.log({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "sc_pullout.created",
      entityType: "ServiceCenterPullout",
      entityId: pullout.id,
      metadata: {
        pulloutNo,
        serialCount: parsed.data.serialNumberIds.length,
      },
    });

    revalidateScLogistics();
    return { success: true as const, id: pullout.id, pulloutNo };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to create pull-out",
    } as const;
  }
}

export async function approveScPulloutAction(pulloutId: string) {
  const session = await requireAnyPermission([
    SC_ORDERS_APPROVE,
    SC_LOGISTICS_MANAGE,
  ]);
  const pullout = await prisma.serviceCenterPullout.findFirst({
    where: { id: pulloutId, tenantId: session.user.tenantId },
    include: { details: true },
  });
  if (!pullout) return { error: "Pull-out not found" as const };

  const forPulloutCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "pullout_workflow",
    "for_pullout",
  );
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

  if (pullout.details.length > 0 && pullout.serviceCenterLocationId) {
    await prisma.serviceCenterInventory.updateMany({
      where: {
        tenantId: session.user.tenantId,
        serviceCenterId: pullout.serviceCenterId,
        serviceCenterLocationId: pullout.serviceCenterLocationId,
        serialNumberId: {
          in: pullout.details.map((d) => d.serialNumberId),
        },
        statusCodeId: rsvCodeId,
      },
      data: { statusCodeId: fpoCodeId },
    });
  }

  await prisma.$transaction([
    prisma.serviceCenterPullout.update({
      where: { id: pulloutId },
      data: { statusCodeId: forPulloutCodeId },
    }),
    prisma.serviceCenterPulloutApprovalLevel.updateMany({
      where: { pulloutId, approvedAt: null, rejectedAt: null },
      data: { approvedAt: new Date(), approvedById: session.user.id },
    }),
  ]);

  revalidateScLogistics();
  return { success: true as const };
}

export async function completeScPulloutAction(pulloutId: string) {
  const session = await requirePermission(SC_LOGISTICS_MANAGE);
  const pullout = await prisma.serviceCenterPullout.findFirst({
    where: { id: pulloutId, tenantId: session.user.tenantId },
    include: { details: true },
  });
  if (!pullout) return { error: "Pull-out not found" as const };

  const completedCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "pullout_workflow",
    "completed",
  );

  if (pullout.details.length > 0 && pullout.serviceCenterLocationId) {
    await prisma.serviceCenterInventory.deleteMany({
      where: {
        tenantId: session.user.tenantId,
        serviceCenterId: pullout.serviceCenterId,
        serviceCenterLocationId: pullout.serviceCenterLocationId,
        serialNumberId: {
          in: pullout.details.map((d) => d.serialNumberId),
        },
      },
    });
  }

  await prisma.serviceCenterPullout.update({
    where: { id: pulloutId },
    data: { statusCodeId: completedCodeId },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_pullout.completed",
    entityType: "ServiceCenterPullout",
    entityId: pulloutId,
    metadata: {
      pulloutNo: pullout.pulloutNo,
      serialCount: pullout.details.length,
    },
  });

  revalidateScLogistics();
  return { success: true as const };
}

export async function listScStkSerialsForLogisticsAction(
  serviceCenterId: string,
  serviceCenterLocationId: string,
) {
  const session = await requireAnyPermission([
    SC_LOGISTICS_CREATE,
    SC_LOGISTICS_MANAGE,
  ]);
  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );
  const rows = await prisma.serviceCenterInventory.findMany({
    where: {
      tenantId: session.user.tenantId,
      serviceCenterId,
      serviceCenterLocationId,
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
