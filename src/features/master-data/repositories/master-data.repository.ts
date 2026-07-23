import { prisma } from "@/lib/database/client";
import { CACHE_TTL, cacheKey, getOrSet } from "@/lib/cache/redis";

export const masterDataRepository = {
  listBrands(tenantId: string) {
    return getOrSet(
      cacheKey("tenant", tenantId, "master-data", "brands"),
      CACHE_TTL.masterData,
      () => prisma.brand.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    );
  },

  listCategories(tenantId: string) {
    return getOrSet(
      cacheKey("tenant", tenantId, "master-data", "categories"),
      CACHE_TTL.masterData,
      () =>
        prisma.category.findMany({
          where: { tenantId },
          orderBy: { name: "asc" },
        }),
    );
  },

  listModels(tenantId: string, brandId?: string) {
    const scope = brandId ?? "all";
    return getOrSet(
      cacheKey("tenant", tenantId, "master-data", "models", scope),
      CACHE_TTL.masterData,
      () =>
        prisma.productModel.findMany({
          where: { tenantId, ...(brandId ? { brandId } : {}) },
          include: { brand: true, category: true },
          orderBy: { skuCode: "asc" },
        }),
    );
  },

  findModel(tenantId: string, id: string) {
    return prisma.productModel.findFirst({
      where: { id, tenantId },
    });
  },

  updateModelStatus(tenantId: string, id: string, status: "active" | "hold" | "retired") {
    return prisma.productModel.update({
      where: { id, tenantId },
      data: { status },
    });
  },

  createBrand(tenantId: string, data: { name: string; code?: string }) {
    return prisma.brand.create({ data: { tenantId, name: data.name, code: data.code } });
  },

  createCategory(tenantId: string, data: { name: string; code?: string }) {
    return prisma.category.create({
      data: {
        tenantId,
        name: data.name,
        code: data.code,
      },
    });
  },

  createModel(
    tenantId: string,
    data: {
      brandId?: string | null;
      categoryId?: string | null;
      featureId?: string | null;
      resolutionId?: string | null;
      actualSizeId?: string | null;
      skuCode: string;
      name: string;
      status?: "active" | "hold" | "retired";
    },
  ) {
    return prisma.productModel.create({
      data: {
        tenantId,
        brandId: data.brandId ?? null,
        categoryId: data.categoryId ?? null,
        featureId: data.featureId ?? null,
        resolutionId: data.resolutionId ?? null,
        actualSizeId: data.actualSizeId ?? null,
        skuCode: data.skuCode,
        name: data.name,
        status: data.status,
      },
    });
  },

  listPriceLists(tenantId: string, modelId?: string) {
    return prisma.priceList.findMany({
      where: { tenantId, ...(modelId ? { modelId } : {}) },
      include: {
        model: { select: { id: true, skuCode: true, name: true } },
        packageType: { select: { id: true, name: true, quantity: true } },
      },
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    });
  },

  createPriceList(
    tenantId: string,
    data: {
      modelId: string;
      amount: number;
      periodStart: Date;
      periodEnd: Date;
      packageTypeId?: string | null;
    },
  ) {
    return prisma.priceList.create({
      data: {
        tenantId,
        modelId: data.modelId,
        amount: data.amount,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        packageTypeId: data.packageTypeId ?? null,
      },
    });
  },

  deletePriceList(tenantId: string, id: string) {
    return prisma.priceList.deleteMany({ where: { id, tenantId } });
  },
};
