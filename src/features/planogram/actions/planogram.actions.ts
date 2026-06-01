"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { branchService } from "@/features/branches/services/branch.service";
import { planogramService } from "@/features/planogram/services/planogram.service";
import {
  parsePlanogramCsvFromContent,
  syncPlanogramFromCsvContent,
  upsertModelsFromPlanogramRows,
} from "@/features/planogram/services/planogram-csv-sync.service";
import { prisma } from "@/lib/database/client";
import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission, requirePermission, requirePlanogramView } from "@/lib/auth/permissions";
import { DEALER1_BRANCH_MAP, readPlanogramCsvContent } from "../../../../prisma/seed-planogram-from-csv";

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

  const [rows, summary] = await Promise.all([
    planogramService.listPlanogram(session.user.tenantId, branchId),
    planogramService.getBranchSummary(session.user.tenantId, branchId),
  ]);
  return { rows, summary, canManage };
}

export async function importPlanogramCsvForBranchAction(
  branchId: string,
  formData?: FormData,
) {
  const session = await requirePlanogramManage();

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: session.user.tenantId },
  });
  if (!branch) return { error: "Branch not found" };

  const branchDef = DEALER1_BRANCH_MAP.find((b) => b.sapCode === branch.sapCode);
  if (!branchDef) {
    return { error: "Branch is not mapped to BRS Dealer 1 CSV columns" };
  }

  const file = formData?.get("file");
  const content =
    file instanceof File && file.size > 0 ? await file.text() : readPlanogramCsvContent();

  const planogramRows = parsePlanogramCsvFromContent(content);

  const brandRecords = new Map<string, { id: string; code: string }>();
  for (const brandName of [...new Set(planogramRows.map((r) => r.brand))]) {
    const code = brandName.slice(0, 4).toUpperCase();
    const brand = await prisma.brand.upsert({
      where: { tenantId_name: { tenantId: session.user.tenantId, name: brandName } },
      create: { tenantId: session.user.tenantId, name: brandName, code },
      update: {},
    });
    brandRecords.set(brandName, { id: brand.id, code: brand.code ?? code });
  }

  const categoryRecords = new Map<string, string>();
  async function getCategoryId(brandName: string, series: string) {
    const key = `${brandName}:${series}`;
    if (categoryRecords.has(key)) return categoryRecords.get(key)!;
    const brandId = brandRecords.get(brandName)?.id;
    if (!brandId) throw new Error(`Brand not found: ${brandName}`);
    const categoryName = series || "General";
    const category = await prisma.category.upsert({
      where: { tenantId_name: { tenantId: session.user.tenantId, name: categoryName } },
      create: { tenantId: session.user.tenantId, name: categoryName, brandId },
      update: { brandId },
    });
    categoryRecords.set(key, category.id);
    return category.id;
  }

  const modelIdBySku = await upsertModelsFromPlanogramRows(
    prisma,
    session.user.tenantId,
    planogramRows,
    brandRecords,
    getCategoryId,
  );

  try {
    await syncPlanogramFromCsvContent(
      prisma,
      session.user.tenantId,
      content,
      [{ id: branchId, branchIndex: branchDef.branchIndex }],
      modelIdBySku,
    );
    revalidatePlanogram(branchId);
    return { success: true as const, skuCount: planogramRows.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed" };
  }
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
