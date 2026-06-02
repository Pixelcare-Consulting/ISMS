"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { warehouseService } from "@/features/warehouses/services/warehouse.service";
import { warehouseRepository } from "@/features/warehouses/repositories/warehouse.repository";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

const warehouseSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  isMain: z.boolean().optional(),
});

const locationSchema = z.object({
  warehouseId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
});

export async function listWarehousesAction() {
  const session = await requirePermission("master_data.manage");
  return warehouseRepository.listByTenant(session.user.tenantId);
}

export async function createWarehouseAction(input: unknown) {
  const session = await requirePermission("master_data.manage");
  const parsed = warehouseSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  try {
    await warehouseService.createWarehouse({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/warehouses");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create warehouse" };
  }
}

export async function updateWarehouseAction(input: unknown) {
  const session = await requirePermission("master_data.manage");
  const parsed = warehouseSchema
    .extend({ warehouseId: z.string().min(1) })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  try {
    await warehouseService.updateWarehouse({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      warehouseId: parsed.data.warehouseId,
      code: parsed.data.code,
      name: parsed.data.name,
      isMain: parsed.data.isMain,
    });
    revalidatePath("/settings/warehouses");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update warehouse" };
  }
}

export async function addWarehouseLocationAction(input: unknown) {
  const session = await requirePermission("master_data.manage");
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  try {
    await warehouseService.addLocation({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/warehouses");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add location" };
  }
}

export async function createWarehouseLocationAction(input: unknown) {
  return addWarehouseLocationAction(input);
}

export async function deleteWarehouseAction(warehouseId: string) {
  const session = await requirePermission("master_data.manage");
  try {
    const linked = await prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId: session.user.tenantId },
      include: { _count: { select: { pulloutsDestination: true, aors: true } } },
    });
    if (!linked) return { error: "Warehouse not found" };
    if (linked._count.pulloutsDestination > 0 || linked._count.aors > 0) {
      return { error: "Warehouse is linked to pull-outs or AORs and cannot be deleted" };
    }
    await prisma.warehouseLocation.deleteMany({ where: { warehouseId } });
    await prisma.warehouse.delete({ where: { id: warehouseId, tenantId: session.user.tenantId } });
    revalidatePath("/settings/warehouses");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete warehouse" };
  }
}

export async function deleteWarehouseLocationAction(warehouseId: string, locationId: string) {
  const session = await requirePermission("master_data.manage");
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId: session.user.tenantId },
  });
  if (!warehouse) return { error: "Warehouse not found" };

  try {
    await warehouseRepository.deleteLocation(warehouseId, locationId);
    revalidatePath("/settings/warehouses");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete location" };
  }
}
