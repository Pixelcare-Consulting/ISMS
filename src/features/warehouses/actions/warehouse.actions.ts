"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { warehouseService } from "@/features/warehouses/services/warehouse.service";
import { warehouseRepository } from "@/features/warehouses/repositories/warehouse.repository";
import { requirePermission } from "@/lib/auth/permissions";

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
    const warehouse = await warehouseService.createWarehouse({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/warehouses");
    return { success: true as const, warehouse };
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
    const location = await warehouseService.addLocation({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/warehouses");
    return { success: true as const, location };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add location" };
  }
}

export async function deleteWarehouseAction(warehouseId: string) {
  const session = await requirePermission("master_data.manage");
  try {
    await warehouseService.deleteWarehouse({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      warehouseId,
    });
    revalidatePath("/settings/warehouses");
    return { success: true as const, warehouseId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete warehouse" };
  }
}

export async function deleteWarehouseLocationAction(warehouseId: string, locationId: string) {
  const session = await requirePermission("master_data.manage");
  try {
    await warehouseService.deleteLocation({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      warehouseId,
      locationId,
    });
    revalidatePath("/settings/warehouses");
    return { success: true as const, warehouseId, locationId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete location" };
  }
}
