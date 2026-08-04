"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditService } from "@/features/audit/services/audit.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  canManualStockIn,
  SC_INVENTORY_VIEW,
} from "@/features/service-center-ops/constants/sc-permissions";
import { scOpsRepository } from "@/features/service-center-ops/repositories/sc-ops.repository";
import {
  assertScInScope,
  resolveScIdsForUser,
} from "@/features/service-center-ops/services/sc-scope";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  hasPermission,
  requireAnyPermission,
  requirePermission,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

function revalidateScInventory() {
  revalidatePath("/service-centers/inventory");
}

export async function listScInventoryAction(input?: {
  page?: number;
  limit?: number;
  statusCodeId?: string;
  serviceCenterId?: string;
}) {
  const session = await requirePermission(SC_INVENTORY_VIEW);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  return scOpsRepository.listInventory(
    session.user.tenantId,
    scopedIds,
    { page: input?.page, limit: parseTablePageSize(input?.limit) },
    {
      statusCodeId: input?.statusCodeId,
      serviceCenterId: input?.serviceCenterId,
    },
  );
}

export async function listScInventoryStatusOptionsAction() {
  const session = await requirePermission(SC_INVENTORY_VIEW);
  return reasonStatusService.listActiveCodes(
    session.user.tenantId,
    "inventory_system",
  );
}

export async function listScCentersForOpsAction() {
  const session = await requireAnyPermission([
    SC_INVENTORY_VIEW,
    "service_centers.sales.view",
    "service_centers.sales.create",
    "service_centers.orders.view",
    "service_centers.orders.create",
    "service_centers.logistics.view",
    "service_centers.logistics.create",
    "service_centers.logistics.manage",
  ]);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  return prisma.serviceCenter.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      status: "active",
      ...(scopedIds ? { id: { in: scopedIds } } : {}),
    },
    include: {
      locations: { orderBy: { code: "asc" }, select: { id: true, code: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function manualScStockInAction(input: unknown) {
  const session = await requireAnyPermission([
    "service_centers.manage",
    "service_centers.logistics.manage",
    "service_centers.logistics.create",
  ]);
  if (!canManualStockIn(session.user.permissions)) {
    return { error: "You do not have permission to stock in" as const };
  }

  const parsed = z
    .object({
      serviceCenterId: z.string().min(1),
      serviceCenterLocationId: z.string().min(1),
      serialNumberId: z.string().min(1),
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

  const location = await prisma.serviceCenterLocation.findFirst({
    where: {
      id: parsed.data.serviceCenterLocationId,
      serviceCenterId: parsed.data.serviceCenterId,
      serviceCenter: { tenantId: session.user.tenantId, deletedAt: null },
    },
    select: { id: true },
  });
  if (!location) return { error: "Service center location not found" as const };

  const serial = await prisma.serialNumber.findFirst({
    where: { id: parsed.data.serialNumberId, tenantId: session.user.tenantId },
    select: { id: true, serialNo: true },
  });
  if (!serial) return { error: "Serial number not found" as const };

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const row = await prisma.serviceCenterInventory.upsert({
    where: {
      serviceCenterLocationId_serialNumberId: {
        serviceCenterLocationId: parsed.data.serviceCenterLocationId,
        serialNumberId: parsed.data.serialNumberId,
      },
    },
    update: { statusCodeId: stkCodeId, serviceCenterId: parsed.data.serviceCenterId },
    create: {
      tenantId: session.user.tenantId,
      serviceCenterId: parsed.data.serviceCenterId,
      serviceCenterLocationId: parsed.data.serviceCenterLocationId,
      serialNumberId: parsed.data.serialNumberId,
      statusCodeId: stkCodeId,
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_inventory.stock_in",
    entityType: "ServiceCenterInventory",
    entityId: row.id,
    metadata: {
      serialNo: serial.serialNo,
      serviceCenterId: parsed.data.serviceCenterId,
    },
  });

  revalidateScInventory();
  return { success: true as const, id: row.id };
}

export async function searchSerialsForScStockInAction(query: string) {
  const session = await requireAnyPermission([
    "service_centers.manage",
    "service_centers.logistics.manage",
    "service_centers.logistics.create",
  ]);
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.serialNumber.findMany({
    where: {
      tenantId: session.user.tenantId,
      serialNo: { contains: q, mode: "insensitive" },
    },
    select: {
      id: true,
      serialNo: true,
      model: { select: { skuCode: true, name: true } },
    },
    orderBy: { serialNo: "asc" },
    take: 25,
  });
}

export async function canManualScStockInAction() {
  const session = await requirePermission(SC_INVENTORY_VIEW);
  return canManualStockIn(session.user.permissions);
}

export function hasScInventoryView(permissions: string[] | undefined) {
  return hasPermission(permissions, SC_INVENTORY_VIEW);
}
