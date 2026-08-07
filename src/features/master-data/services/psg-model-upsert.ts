import type { PrismaClient } from "@/lib/database/generated/prisma/client";
import type { PsgModelRow } from "@/features/master-data/services/psg-model-workbook";

type SeedPrisma = Pick<PrismaClient, "brand" | "series" | "productModel">;

export interface UpsertPsgModelsResult {
  brandsUpserted: number;
  seriesUpserted: number;
  modelsCreated: number;
  modelsUpdated: number;
  /** skuCode (as written) → ProductModel.id */
  modelIdBySku: Map<string, string>;
}

const CHUNK = 40;

/**
 * Chunked upsert of Brand → Series → ProductModel for one tenant.
 * Upsert key for models: @@unique([tenantId, skuCode]). Sets status active.
 */
export async function upsertPsgModels(
  prisma: SeedPrisma,
  tenantId: string,
  rows: PsgModelRow[],
): Promise<UpsertPsgModelsResult> {
  const brandNames = [...new Set(rows.map((row) => row.brandName))];
  const brandIdByName = new Map<string, string>();

  for (const name of brandNames) {
    const code = name.slice(0, 4).toUpperCase();
    const brand = await prisma.brand.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: { tenantId, name, code },
      update: {},
      select: { id: true, name: true },
    });
    brandIdByName.set(brand.name, brand.id);
  }

  const seriesNames = [...new Set(rows.map((row) => row.seriesName))];
  const seriesIdByName = new Map<string, string>();
  const seriesCodeByName = new Map<string, string | null>();
  for (const row of rows) {
    if (!seriesCodeByName.has(row.seriesName) && row.seriesCode) {
      seriesCodeByName.set(row.seriesName, row.seriesCode);
    }
  }

  for (const name of seriesNames) {
    const code = seriesCodeByName.get(name) ?? null;
    const series = await prisma.series.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: {
        tenantId,
        name,
        code: code ?? undefined,
        recordStatus: "active",
      },
      update: {
        recordStatus: "active",
        ...(code ? { code } : {}),
      },
      select: { id: true, name: true },
    });
    seriesIdByName.set(series.name, series.id);
  }

  let modelsCreated = 0;
  let modelsUpdated = 0;
  const modelIdBySku = new Map<string, string>();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);

    for (const row of chunk) {
      const brandId = brandIdByName.get(row.brandName) ?? null;
      const seriesId = seriesIdByName.get(row.seriesName) ?? null;

      const existing = await prisma.productModel.findUnique({
        where: { tenantId_skuCode: { tenantId, skuCode: row.skuCode } },
        select: { id: true },
      });

      if (!existing) {
        const created = await prisma.productModel.create({
          data: {
            tenantId,
            skuCode: row.skuCode,
            name: row.name,
            brandId,
            seriesId,
            cbm: row.cbm,
            status: "active",
          },
          select: { id: true },
        });
        modelIdBySku.set(row.skuCode, created.id);
        modelsCreated += 1;
      } else {
        await prisma.productModel.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            brandId,
            seriesId,
            cbm: row.cbm,
            status: "active",
          },
        });
        modelIdBySku.set(row.skuCode, existing.id);
        modelsUpdated += 1;
      }
    }
  }

  return {
    brandsUpserted: brandNames.length,
    seriesUpserted: seriesNames.length,
    modelsCreated,
    modelsUpdated,
    modelIdBySku,
  };
}
