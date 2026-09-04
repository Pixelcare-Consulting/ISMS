import { prisma } from "@/lib/database/client";
import { createInChunks, updateEach } from "@/features/sap/services/sap-sync-writer";
import type { SapSyncApplyResult } from "@/features/sap/types/sap-sync-entity";
import { CACHE_TTL, cacheKey, getOrSet } from "@/lib/cache/redis";
import type { SkuStatus } from "@/lib/database/generated/prisma/client";

/** Case-insensitive brand matching, the same key the Excel model import matches on. */
function brandKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve the brands one synced page names, creating the ones ISMS does not have yet.
 *
 * SAP owns the classification, so a brand it sends that ISMS has never seen is created
 * rather than being a reason to refuse the model — the same bargain the Excel import
 * makes, down to the four-letter code it derives for a new row. `brands` is a
 * tenant-scoped table of tens of rows, so reading it whole per page is cheaper than a
 * query per name and keeps the matching case-insensitive.
 */
async function resolveSyncBrandIds(
  tenantId: string,
  names: string[],
): Promise<Map<string, string>> {
  // Keep the first spelling seen for each name, so a new brand is created as SAP writes it.
  const wanted = new Map<string, string>();
  for (const name of names) {
    const key = brandKey(name);
    if (key && !wanted.has(key)) wanted.set(key, name.trim());
  }

  const idByKey = new Map<string, string>();
  if (wanted.size === 0) return idByKey;

  const existing = await prisma.brand.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  for (const brand of existing) idByKey.set(brandKey(brand.name), brand.id);

  const missing = [...wanted].filter(([key]) => !idByKey.has(key));
  if (missing.length === 0) return idByKey;

  const created = await prisma.brand.createManyAndReturn({
    data: missing.map(([, name]) => ({ tenantId, name, code: name.slice(0, 4).toUpperCase() })),
    skipDuplicates: true,
    select: { id: true, name: true },
  });
  for (const brand of created) idByKey.set(brandKey(brand.name), brand.id);

  // `skipDuplicates` swallows rows a concurrent import or sync inserted first, so those
  // come back unresolved. Re-read only when that actually happened.
  if (missing.some(([key]) => !idByKey.has(key))) {
    const after = await prisma.brand.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    for (const brand of after) idByKey.set(brandKey(brand.name), brand.id);
  }

  return idByKey;
}

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

  /** Apply one page of a SAP item sync, matched on `skuCode`. */
  async applySapSyncPage(
    tenantId: string,
    records: { skuCode: string; name: string; status: SkuStatus; brandName: string }[],
  ): Promise<SapSyncApplyResult> {
    // Paged by ItemCode, so a repeat within a page would be a SAP anomaly; first wins.
    const rows = [...new Map(records.map((row) => [row.skuCode, row])).values()];

    const [existing, brandIdByKey] = await Promise.all([
      prisma.productModel.findMany({
        where: { tenantId, skuCode: { in: rows.map((row) => row.skuCode) } },
        select: {
          id: true,
          skuCode: true,
          name: true,
          description: true,
          status: true,
          brandId: true,
        },
      }),
      resolveSyncBrandIds(tenantId, rows.map((row) => row.brandName)),
    ]);
    const bySkuCode = new Map(existing.map((model) => [model.skuCode, model]));

    interface ModelFields {
      skuCode: string;
      name: string;
      description: string;
      status: SkuStatus;
      brandId: string;
    }
    const toCreate: ModelFields[] = [];
    const toUpdate: (ModelFields & { id: string })[] = [];
    const failures: { reason: string; example?: string | null }[] = [];
    let unchanged = 0;

    for (const row of rows) {
      // Every row reaching here named a brand, so an unresolved id means the create above
      // neither inserted it nor found it — a real anomaly, not a blank to write over a
      // classification the model may already carry.
      const brandId = brandIdByKey.get(brandKey(row.brandName));
      if (!brandId) {
        failures.push({ reason: "Brand could not be created in ISMS", example: row.brandName });
        continue;
      }

      // Both columns track ItemName. `description` is the mapped target; `name` carries
      // it too because the column is NOT NULL and, with manual creation disabled, SAP is
      // the only thing that ever names a model.
      const fields = {
        skuCode: row.skuCode,
        name: row.name,
        description: row.name,
        status: row.status,
        brandId,
      };
      const match = bySkuCode.get(row.skuCode);

      if (!match) {
        toCreate.push(fields);
        continue;
      }
      if (
        match.name === fields.name &&
        match.description === fields.description &&
        match.status === fields.status &&
        match.brandId === fields.brandId
      ) {
        unchanged += 1;
        continue;
      }
      toUpdate.push({ id: match.id, ...fields });
    }

    const inserted = await createInChunks(toCreate, {
      createMany: async (chunk) => {
        const result = await prisma.productModel.createMany({
          data: chunk.map((row) => ({ tenantId, ...row })),
        });
        return result.count;
      },
      createOne: async (row) => {
        await prisma.productModel.create({ data: { tenantId, ...row } });
      },
      describe: (row) => row.skuCode,
    });

    const changed = await updateEach(toUpdate, {
      updateOne: async (row) => {
        await prisma.productModel.update({
          where: { id: row.id, tenantId },
          data: {
            name: row.name,
            description: row.description,
            status: row.status,
            brandId: row.brandId,
          },
        });
      },
      describe: (row) => row.skuCode,
    });

    return {
      created: inserted.created,
      updated: changed.updated,
      unchanged,
      failures: [...failures, ...inserted.failures, ...changed.failures],
    };
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
