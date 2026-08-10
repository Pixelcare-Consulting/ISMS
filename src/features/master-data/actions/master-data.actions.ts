"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { toClientModelRow } from "@/features/master-data/types/client-model";
import { toClientPriceListRow } from "@/features/master-data/types/client-price-list";
import { requirePermission } from "@/lib/auth/permissions";
import { cacheKey, deleteCache } from "@/lib/cache/redis";
import { prisma } from "@/lib/database/client";

function invalidateModelsCache(tenantId: string) {
  return deleteCache(cacheKey("tenant", tenantId, "master-data", "models", "all"));
}

const brandSchema = z.object({ name: z.string().min(1), code: z.string().optional() });
const seriesSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
});
const modelSchema = z.object({
  brandId: z.string().optional(),
  seriesId: z.string().optional(),
  featureId: z.string().optional(),
  resolutionId: z.string().optional(),
  actualSizeId: z.string().optional(),
  skuCode: z.string().min(1),
  name: z.string().min(1),
});

const priceListSchema = z.object({
  modelId: z.string().min(1),
  amount: z.coerce.number().positive(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  packageTypeId: z.string().optional().nullable(),
});

function revalidateMasterData() {
  revalidatePath("/settings/master-data/brands");
  revalidatePath("/settings/master-data/models");
  revalidatePath("/settings/master-data/series");
  revalidatePath("/settings/master-data/categories");
  revalidatePath("/settings/master-data/price-lists");
}

export async function listBrandsAction() {
  const session = await requirePermission("master_data.manage");
  return masterDataRepository.listBrands(session.user.tenantId);
}

export async function listSeriesAction() {
  const session = await requirePermission("master_data.manage");
  return masterDataRepository.listSeries(session.user.tenantId);
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

export async function createSeriesAction(input: unknown) {
  const session = await requirePermission("master_data.manage");
  const parsed = seriesSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const series = await masterDataRepository.createSeries(
      session.user.tenantId,
      parsed.data,
    );
    revalidateMasterData();
    return { success: true as const, series };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create series" };
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

export async function listModelFormLookupsAction() {
  const session = await requirePermission("master_data.manage");
  const tenantId = session.user.tenantId;
  const [features, resolutions, actualSizes, packageTypes] = await Promise.all([
    prisma.feature.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.resolution.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.actualSize.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.packageType.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
  ]);
  return { features, resolutions, actualSizes, packageTypes };
}

export async function listPriceListsAction(modelId?: string) {
  const session = await requirePermission("master_data.manage");
  const rows = await masterDataRepository.listPriceLists(
    session.user.tenantId,
    modelId,
  );
  return rows.map(toClientPriceListRow);
}

export async function createPriceListAction(input: unknown) {
  const session = await requirePermission("master_data.manage");
  const parsed = priceListSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    await masterDataRepository.createPriceList(session.user.tenantId, {
      modelId: parsed.data.modelId,
      amount: parsed.data.amount,
      periodStart: new Date(parsed.data.periodStart),
      periodEnd: new Date(parsed.data.periodEnd),
      packageTypeId: parsed.data.packageTypeId ?? null,
    });
    await invalidateModelsCache(session.user.tenantId);
    revalidateMasterData();
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create price list" };
  }
}

export async function deletePriceListAction(id: string) {
  const session = await requirePermission("master_data.manage");
  try {
    await masterDataRepository.deletePriceList(session.user.tenantId, id);
    await invalidateModelsCache(session.user.tenantId);
    revalidateMasterData();
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete price list" };
  }
}
