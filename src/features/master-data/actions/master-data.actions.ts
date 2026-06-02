"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { toClientModelRow } from "@/features/master-data/types/client-model";
import { requirePermission } from "@/lib/auth/permissions";

const brandSchema = z.object({ name: z.string().min(1), code: z.string().optional() });
const categorySchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  brandId: z.string().optional(),
});
const modelSchema = z.object({
  brandId: z.string().optional(),
  categoryId: z.string().optional(),
  skuCode: z.string().min(1),
  name: z.string().min(1),
});

function revalidateMasterData() {
  revalidatePath("/settings/master-data/brands");
  revalidatePath("/settings/master-data/models");
}

export async function listBrandsAction() {
  const session = await requirePermission("master_data.manage");
  return masterDataRepository.listBrands(session.user.tenantId);
}

export async function listCategoriesAction() {
  const session = await requirePermission("master_data.manage");
  return masterDataRepository.listCategories(session.user.tenantId);
}

export async function listModelsAction() {
  const session = await requirePermission("master_data.manage");
  const rows = await masterDataRepository.listModels(session.user.tenantId);
  return rows.map(toClientModelRow);
}

export async function createBrandAction(input: unknown) {
  const session = await requirePermission("master_data.manage");
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const brand = await masterDataRepository.createBrand(session.user.tenantId, parsed.data);
    revalidateMasterData();
    return { success: true as const, brand };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create brand" };
  }
}

export async function createCategoryAction(input: unknown) {
  const session = await requirePermission("master_data.manage");
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const category = await masterDataRepository.createCategory(
      session.user.tenantId,
      parsed.data,
    );
    revalidateMasterData();
    return { success: true as const, category };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create category" };
  }
}

export async function createModelAction(input: unknown) {
  const session = await requirePermission("master_data.manage");
  const parsed = modelSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const model = await masterDataRepository.createModel(session.user.tenantId, parsed.data);
    revalidateMasterData();
    return { success: true as const, model };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create model" };
  }
}

const modelStatusSchema = z.object({
  modelId: z.string().min(1),
  status: z.enum(["active", "hold", "retired"]),
});

export async function updateModelStatusAction(input: unknown) {
  const session = await requirePermission("master_data.manage");
  const parsed = modelStatusSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const { masterDataService } = await import(
      "@/features/master-data/services/master-data.service"
    );
    await masterDataService.updateModelStatus({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      modelId: parsed.data.modelId,
      status: parsed.data.status,
    });
    revalidateMasterData();
    return { success: true as const, modelId: parsed.data.modelId, status: parsed.data.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update status" };
  }
}
