"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { branchService } from "@/features/branches/services/branch.service";
import { planogramService } from "@/features/planogram/services/planogram.service";
import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission, requirePermission, requirePlanogramView } from "@/lib/auth/permissions";

function revalidatePlanogram(branchId: string) {
  revalidatePath(`/settings/branches/${branchId}/planogram`);
  revalidatePath("/settings/planogram");
  revalidatePath("/dashboard");
  revalidatePath("/orders");
}

async function requirePlanogramAccess() {
  const session = await requirePlanogramView();
  const canManage = hasPermission(session.user.permissions, "planogram.manage");
  return { session, canManage };
}

async function requirePlanogramManage() {
  return requirePermission("planogram.manage");
}

export async function listBranchesForPlanogramAction() {
  const { session } = await requirePlanogramAccess();
  const all = await branchService.listBranches(session.user.tenantId);

  const hasFullAccess =
    hasPermission(session.user.permissions, "planogram.manage") ||
    hasPermission(session.user.permissions, "branches.manage");

  if (hasFullAccess) {
    return all.map((b) => ({ id: b.id, name: b.name, sapCode: b.sapCode }));
  }

  const branchIds = await getUserBranchIds(session.user.tenantId, session.user.id);
  if (!branchIds?.length) return [];

  const allowed = new Set(branchIds);
  return all
    .filter((b) => allowed.has(b.id))
    .map((b) => ({ id: b.id, name: b.name, sapCode: b.sapCode }));
}

export async function listPlanogramAction(branchId: string) {
  const { session, canManage } = await requirePlanogramAccess();

  const branchIds = await getUserBranchIds(session.user.tenantId, session.user.id);
  const hasFullAccess =
    canManage || hasPermission(session.user.permissions, "branches.manage");

  if (!hasFullAccess && branchIds?.length && !branchIds.includes(branchId)) {
    return { error: "Branch not in your area of responsibility" as const, rows: [] };
  }

  const rows = await planogramService.listPlanogram(session.user.tenantId, branchId);
  return { rows, canManage };
}

export async function listActiveModelsForPlanogramAction(branchId: string) {
  const session = await requirePlanogramManage();
  return planogramService.listActiveModelsForAdd(session.user.tenantId, branchId);
}

const addSchema = z.object({
  branchId: z.string().min(1),
  modelId: z.string().min(1),
  maxQty: z.number().int().min(1),
  daysThreshold: z.number().int().min(1).optional(),
});

export async function addPlanogramModelAction(input: unknown) {
  const session = await requirePlanogramManage();
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  try {
    await planogramService.addModel({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePlanogram(parsed.data.branchId);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add model" };
  }
}

const updateMaxQtySchema = z.object({
  planogramId: z.string().min(1),
  branchId: z.string().min(1),
  maxQty: z.number().int().min(1),
});

export async function updatePlanogramMaxQtyAction(input: unknown) {
  const session = await requirePlanogramManage();
  const parsed = updateMaxQtySchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  try {
    await planogramService.updateMaxQty({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      planogramId: parsed.data.planogramId,
      maxQty: parsed.data.maxQty,
    });
    revalidatePlanogram(parsed.data.branchId);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update max qty" };
  }
}

const updateMilSchema = z.object({
  branchId: z.string().min(1),
  modelId: z.string().min(1),
  daysThreshold: z.number().int().min(1),
});

export async function updatePlanogramMilAction(input: unknown) {
  const session = await requirePlanogramManage();
  const parsed = updateMilSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  try {
    await planogramService.updateMilDays({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePlanogram(parsed.data.branchId);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update MIL" };
  }
}

export async function removePlanogramModelAction(planogramId: string, branchId: string) {
  const session = await requirePlanogramManage();

  try {
    await planogramService.removeModel({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      planogramId,
    });
    revalidatePlanogram(branchId);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to remove model" };
  }
}
