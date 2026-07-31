import type { PrismaClient } from "@/lib/database/generated/prisma/client";
import type { PsgModelRow } from "@/features/master-data/services/psg-model-workbook";

type SeedPrisma = Pick<PrismaClient, "brand" | "category" | "productModel">;

export interface UpsertPsgModelsResult {
  brandsUpserted: number;
  categoriesUpserted: number;
  modelsCreated: number;
  modelsUpdated: number;
  /** skuCode (as written) → ProductModel.id */
  modelIdBySku: Map<string, string>;
}

const CHUNK = 40;

/**
 * Chunked upsert of Brand → Category → ProductModel for one tenant.
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

  const categoryNames = [...new Set(rows.map((row) => row.categoryName))];
  const categoryIdByName = new Map<string, string>();
  const categoryCodeByName = new Map<string, string | null>();
  for (const row of rows) {
    if (!categoryCodeByName.has(row.categoryName) && row.categoryCode) {
      categoryCodeByName.set(row.categoryName, row.categoryCode);
    }
  }

  for (const name of categoryNames) {
    const code = categoryCodeByName.get(name) ?? null;
    const category = await prisma.category.upsert({
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
    categoryIdByName.set(category.name, category.id);
  }

  let modelsCreated = 0;
  let modelsUpdated = 0;
  const modelIdBySku = new Map<string, string>();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);

    for (const row of chunk) {
      const brandId = brandIdByName.get(row.brandName) ?? null;
      const categoryId = categoryIdByName.get(row.categoryName) ?? null;

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
            categoryId,
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
            categoryId,
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
    categoriesUpserted: categoryNames.length,
    modelsCreated,
    modelsUpdated,
    modelIdBySku,
  };
}
