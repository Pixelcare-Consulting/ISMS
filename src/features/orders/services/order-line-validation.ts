import type { BranchOrderType } from "@prisma/client";

import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";

/** Planogram, hold/retired, and Shelf max − STK checks used by typed orders. */
export async function validateOrderLines(
  tenantId: string,
  branchId: string,
  orderType: BranchOrderType,
  details: { modelId: string; quantity: number }[],
) {
  if (details.length === 0) throw new Error("Order must include at least one line");

  for (const line of details) {
    if (line.quantity < 1) throw new Error("Quantity must be at least 1");

    const model = await masterDataRepository.findModel(tenantId, line.modelId);
    if (!model) throw new Error(`Model not found: ${line.modelId}`);

    if (model.status === "hold" || model.status === "retired") {
      throw new Error(`SKU ${model.skuCode} is ${model.status} and cannot be ordered`);
    }

    if (orderType === "special") continue;

    const planogram = await planogramRepository.findPlanogramEntry(
      tenantId,
      branchId,
      line.modelId,
    );
    if (!planogram) {
      throw new Error(
        `SKU ${model.skuCode} is not on the branch planogram. Use a special order for off-planogram SKUs.`,
      );
    }

    const stockCount = await planogramRepository.countStockForModel(
      tenantId,
      branchId,
      line.modelId,
    );
    const remainingCapacity = Math.max(0, planogram.maxQty - stockCount);
    if (line.quantity > remainingCapacity) {
      throw new Error(
        `Quantity for ${model.skuCode} exceeds shelf capacity (${remainingCapacity} remaining of Shelf max ${planogram.maxQty})`,
      );
    }
  }
}
