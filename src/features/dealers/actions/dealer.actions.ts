"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dealerRepository } from "@/features/dealers/repositories/dealer.repository";
import { dealerSapSyncService } from "@/features/dealers/services/dealer-sap-sync.service";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

const dealerSchema = z.object({
  name: z.string().min(1).max(120),
  sapCode: z.string().max(32).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
  areaId: z.string().optional().nullable(),
  dealerTypeId: z.string().optional().nullable(),
  dealerAreaId: z.string().optional().nullable(),
  modeOfPaymentId: z.string().optional().nullable(),
});

function revalidateDealers() {
  revalidatePath("/settings/dealers");
}

export async function listDealersAction() {
  const session = await requirePermission("dealers.manage");
  return dealerRepository.listByTenant(session.user.tenantId);
}

export async function listDealerFormOptionsAction() {
  const session = await requirePermission("dealers.manage");
  const tenantId = session.user.tenantId;
  const [areas, dealerTypes, dealerAreas, modes] = await Promise.all([
    prisma.area.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.dealerType.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.dealerArea.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.modeOfPayment.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
  ]);
  return { areas, dealerTypes, dealerAreas, modes };
}

export async function createDealerAction(input: unknown) {
  const session = await requirePermission("dealers.manage");
  const parsed = dealerSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const dealer = await dealerRepository.create(session.user.tenantId, parsed.data);
    revalidateDealers();
    return { success: true as const, dealer };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create dealer" };
  }
}

export async function updateDealerAction(input: unknown) {
  const session = await requirePermission("dealers.manage");
  const schema = dealerSchema.extend({ dealerId: z.string().min(1) });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  const { dealerId, ...data } = parsed.data;
  try {
    const existing = await dealerRepository.findById(session.user.tenantId, dealerId);
    if (!existing) return { error: "Dealer not found" };
    const dealer = await dealerRepository.update(session.user.tenantId, dealerId, data);
    revalidateDealers();
    return { success: true as const, dealer };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update dealer" };
  }
}

export async function deleteDealerAction(dealerId: string) {
  const session = await requirePermission("dealers.manage");
  try {
    await dealerRepository.softDelete(session.user.tenantId, dealerId);
    revalidateDealers();
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete dealer" };
  }
}

export async function syncDealersFromSapAction() {
  const session = await requirePermission("dealers.manage");
  try {
    const result = await dealerSapSyncService.syncFromSap(
      session.user.tenantId,
      session.user.id,
    );
    revalidateDealers();
    return { success: true as const, result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to sync customers from SAP" };
  }
}
