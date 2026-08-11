import type { PrismaClient } from "@prisma/client";

/** Demo warehouse-only serials for Official Sales WHSE_ADD UAT. */
export const DEMO_WHSE_SERIALS = [
  { serialNo: "SN-WHSE-001", skuCode: "32STV104" },
  { serialNo: "SN-WHSE-002", skuCode: "32STV104" },
  { serialNo: "SN-WHSE-003", skuCode: "32STV105" },
] as const;

const WAREHOUSE_CODE = "PASIG-MAIN";
const LOCATION_CODE = "A1";

/**
 * Upsert 3 warehouse-only demo serials on PASIG-MAIN / A1.
 * Requires demo BRS warehouse + models (run `db:seed:brs` / `db:seed:full` first).
 * Does not place these serials in BranchInventory.
 */
export async function seedWarehouseInventoryDemo(
  prisma: PrismaClient,
  tenantId: string,
  modelIdBySku?: Map<string, string>,
) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { tenantId_code: { tenantId, code: WAREHOUSE_CODE } },
    select: { id: true, code: true },
  });
  if (!warehouse) {
    throw new Error(
      `Warehouse ${WAREHOUSE_CODE} not found for demo tenant. Run \`pnpm run db:seed:brs\` or \`pnpm run db:seed:full\` first.`,
    );
  }

  const location = await prisma.warehouseLocation.findUnique({
    where: {
      warehouseId_code: { warehouseId: warehouse.id, code: LOCATION_CODE },
    },
    select: { id: true, code: true },
  });
  if (!location) {
    throw new Error(
      `Warehouse location ${WAREHOUSE_CODE}/${LOCATION_CODE} not found. Run \`pnpm run db:seed:brs\` or \`pnpm run db:seed:full\` first.`,
    );
  }

  const neededSkus = [...new Set(DEMO_WHSE_SERIALS.map((s) => s.skuCode))];
  const resolvedModelIds = new Map<string, string>(modelIdBySku);

  for (const sku of neededSkus) {
    if (resolvedModelIds.has(sku)) continue;
    const model = await prisma.productModel.findUnique({
      where: { tenantId_skuCode: { tenantId, skuCode: sku } },
      select: { id: true },
    });
    if (!model) {
      throw new Error(
        `Product model SKU ${sku} not found for demo tenant. Run \`pnpm run db:seed:brs\` or \`pnpm run db:seed:full\` first.`,
      );
    }
    resolvedModelIds.set(sku, model.id);
  }

  const seeded: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const item of DEMO_WHSE_SERIALS) {
      const modelId = resolvedModelIds.get(item.skuCode);
      if (!modelId) continue;

      const sn = await tx.serialNumber.upsert({
        where: { tenantId_serialNo: { tenantId, serialNo: item.serialNo } },
        create: { tenantId, modelId, serialNo: item.serialNo },
        update: { modelId },
      });

      await tx.warehouseInventory.upsert({
        where: {
          warehouseLocationId_serialNumberId: {
            warehouseLocationId: location.id,
            serialNumberId: sn.id,
          },
        },
        create: {
          tenantId,
          serialNumberId: sn.id,
          warehouseLocationId: location.id,
          systemStatus: "STK",
          systemUpdatedAt: new Date(),
        },
        update: {
          systemStatus: "STK",
          systemUpdatedAt: new Date(),
        },
      });

      seeded.push(item.serialNo);
    }
  });

  console.log(
    `Warehouse inventory seed: ${seeded.length} serials on ${WAREHOUSE_CODE}/${LOCATION_CODE} — ${seeded.join(", ")}`,
  );

  return seeded;
}
