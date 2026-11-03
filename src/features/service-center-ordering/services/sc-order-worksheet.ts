import { fetchSapWarehouseItemStock } from "@/features/sap/services/sap-warehouse-stock";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { prisma } from "@/lib/database/client";

export interface ScOrderWorksheetLine {
  modelId: string;
  skuCode: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  /** SAP in stock less committed, in the ordering warehouse. The most one order can take. */
  available: number;
}

export interface ScOrderWorksheet {
  warehouseCode: string;
  lines: ScOrderWorksheetLine[];
  /** SAP items in stock there that are not active ISMS models, so they can't be ordered. */
  skippedItemCount: number;
}

/**
 * What a service-center order can draw on: the active ISMS models SAP has available in
 * `warehouseCode` (the Settings default). Read live, since ISMS does not mirror that
 * warehouse's stock.
 */
export async function loadScOrderWorksheet(
  tenantId: string,
  warehouseCode: string,
): Promise<ScOrderWorksheet> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error("SAP Service Layer is not configured");
  const stock = (await fetchSapWarehouseItemStock(creds, warehouseCode)).filter(
    (item) => item.available > 0,
  );
  const availableBySku = new Map(stock.map((item) => [item.itemCode, item.available]));
  const models = await prisma.productModel.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: "active",
      skuCode: { in: [...availableBySku.keys()] },
    },
    select: { id: true, skuCode: true, name: true, brandId: true, brand: { select: { name: true } } },
    orderBy: { skuCode: "asc" },
  });
  return {
    warehouseCode,
    lines: models.map((model) => ({
      modelId: model.id,
      skuCode: model.skuCode,
      name: model.name,
      brandId: model.brandId,
      brandName: model.brand?.name ?? null,
      available: availableBySku.get(model.skuCode) ?? 0,
    })),
    skippedItemCount: availableBySku.size - models.length,
  };
}

/** Throws when a line asks for a model the warehouse doesn't have, or more than it has. */
export function assertWithinWarehouseStock(
  worksheet: ScOrderWorksheet,
  lines: { modelId: string; quantity: number }[],
): void {
  const byModel = new Map(worksheet.lines.map((line) => [line.modelId, line]));
  for (const line of lines) {
    const stock = byModel.get(line.modelId);
    if (!stock) {
      throw new Error(`A model on this order has no stock available in ${worksheet.warehouseCode}.`);
    }
    if (line.quantity > stock.available) {
      throw new Error(
        `${stock.skuCode}: only ${stock.available} available in ${worksheet.warehouseCode}.`,
      );
    }
  }
}
