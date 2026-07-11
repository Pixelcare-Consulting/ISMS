"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { serviceCenterRepository } from "@/features/service-centers/repositories/service-center.repository";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

function revalidate() {
  revalidatePath("/settings/service-centers");
}

export async function listServiceCentersAction() {
  const session = await requirePermission("branches.manage");
  return serviceCenterRepository.listByTenant(session.user.tenantId);
}

export async function listServiceCenterFormOptionsAction() {
  const session = await requirePermission("branches.manage");
  const tenantId = session.user.tenantId;
  const [areas, regions, provinces, dealerAreas, branchAreas] = await Promise.all([
    prisma.area.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.region.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.province.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.dealerArea.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.branchArea.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
  ]);
  return { areas, regions, provinces, dealerAreas, branchAreas };
}

export async function createServiceCenterAction(input: unknown) {
  const session = await requirePermission("branches.manage");
  const parsed = z
    .object({
      sapCode: z.string().min(1).max(32),
      name: z.string().min(1).max(120),
      areaId: z.string().optional().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const center = await serviceCenterRepository.create(session.user.tenantId, parsed.data);
    revalidate();
    return { success: true as const, center };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create service center" };
  }
}

export async function addServiceCenterLocationAction(input: unknown) {
  await requirePermission("branches.manage");
  const parsed = z
    .object({
      serviceCenterId: z.string().min(1),
      code: z.string().min(1).max(32),
      name: z.string().min(1).max(120),
      areaId: z.string().optional().nullable(),
      dealerAreaId: z.string().optional().nullable(),
      regionId: z.string().optional().nullable(),
      provinceId: z.string().optional().nullable(),
      branchAreaId: z.string().optional().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const { serviceCenterId, ...data } = parsed.data;
    const location = await serviceCenterRepository.addLocation(serviceCenterId, data);
    revalidate();
    return { success: true as const, location };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add location" };
  }
}

export async function deleteServiceCenterAction(id: string) {
  const session = await requirePermission("branches.manage");
  try {
    await serviceCenterRepository.softDelete(session.user.tenantId, id);
    revalidate();
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete" };
  }
}

export async function deleteServiceCenterLocationAction(id: string) {
  await requirePermission("branches.manage");
  try {
    await serviceCenterRepository.deleteLocation(id);
    revalidate();
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete location" };
  }
}
