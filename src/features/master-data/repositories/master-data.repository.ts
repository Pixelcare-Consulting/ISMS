import { prisma } from "@/lib/database/client";
import { describeWriteError, SAP_SYNC_CHUNK } from "@/features/sap/services/sap-master-data";
import { CACHE_TTL, cacheKey, getOrSet } from "@/lib/cache/redis";
import type { SkuStatus } from "@/lib/database/generated/prisma/client";

export const masterDataRepository = {
  listBrands(tenantId: string) {
    return getOrSet(
      cacheKey("tenant", tenantId, "master-data", "brands"),
      CACHE_TTL.masterData,
      () => prisma.brand.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    );
  },

  listSeries(tenantId: string) {
    return getOrSet(
      cacheKey("tenant", tenantId, "master-data", "series"),
      CACHE_TTL.masterData,
      () =>
        prisma.series.findMany({
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
          include: {
            brand: true,
            series: true,
            priceLists: {
              select: {
                id: true,
                amount: true,
                periodStart: true,
                periodEnd: true,
                packageTypeId: true,
                packageType: { select: { id: true, name: true, quantity: true } },
              },
              orderBy: { periodStart: "desc" },
            },
          },
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

  createSeries(tenantId: string, data: { name: string; code?: string }) {
    return prisma.series.create({
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
      seriesId?: string | null;
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
        seriesId: data.seriesId ?? null,
        featureId: data.featureId ?? null,
        resolutionId: data.resolutionId ?? null,
        actualSizeId: data.actualSizeId ?? null,
        skuCode: data.skuCode,
        name: data.name,
        status: data.status,
      },
    });
  },

  /** Every model for the tenant, keyed for SAP matching on `skuCode`. */
  listSapSyncSnapshot(tenantId: string) {
    return prisma.productModel.findMany({
      where: { tenantId },
      select: { id: true, skuCode: true, name: true, description: true, status: true },
    });
  },

  /**
   * Apply a SAP item sync. Chunked, with a per-row fallback so one rejected row is
   * reported by itself rather than failing the whole batch.
   */
  async applySapSync(
    tenantId: string,
    input: {
      create: { skuCode: string; name: string; description: string; status: SkuStatus }[];
      update: { id: string; skuCode: string; name: string; description: string; status: SkuStatus }[];
    },
  ) {
    const failures: { sapCode: string; name: string; reason: string }[] = [];
    let created = 0;
    let updated = 0;

    for (let i = 0; i < input.create.length; i += SAP_SYNC_CHUNK) {
      const chunk = input.create.slice(i, i + SAP_SYNC_CHUNK);
      try {
        const result = await prisma.productModel.createMany({
          data: chunk.map((row) => ({ tenantId, ...row })),
        });
        created += result.count;
      } catch {
        for (const row of chunk) {
          try {
            await prisma.productModel.create({ data: { tenantId, ...row } });
            created += 1;
          } catch (e) {
            failures.push({ sapCode: row.skuCode, name: row.name, reason: describeWriteError(e) });
          }
        }
      }
    }

    for (const row of input.update) {
      try {
        await prisma.productModel.update({
          where: { id: row.id, tenantId },
          // Both track ItemName. `description` is the mapped target; `name` carries it
          // too because the column is NOT NULL and, with manual creation disabled, SAP
          // is the only thing that ever names a model.
          data: { name: row.name, description: row.description, status: row.status },
        });
        updated += 1;
      } catch (e) {
        failures.push({ sapCode: row.skuCode, name: row.name, reason: describeWriteError(e) });
      }
    }

    return { created, updated, failures };
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
