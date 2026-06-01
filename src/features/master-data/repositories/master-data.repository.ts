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
          include: { brand: true },
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

  createCategory(tenantId: string, data: { name: string; code?: string; brandId?: string }) {
    return prisma.category.create({
      data: {
        tenantId,
        name: data.name,
        code: data.code,
        brandId: data.brandId ?? null,
      },
    });
  },

  createModel(
    tenantId: string,
    data: {
      brandId?: string | null;
      categoryId?: string | null;
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
        skuCode: data.skuCode,
        name: data.name,
        status: data.status,
      },
    });
  },
};
