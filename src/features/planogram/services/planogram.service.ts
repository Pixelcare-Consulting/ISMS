import { auditService } from "@/features/audit/services/audit.service";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";

export interface PlanogramRow {
  id: string;
  branchId: string;
  modelId: string;
  maxQty: number;
  stockCount: number;
  daysThreshold: number | null;
  model: {
    id: string;
    skuCode: string;
    name: string;
    status: string;
    brand: { name: string } | null;
  };
}

export const planogramService = {
  async listPlanogram(tenantId: string, branchId: string): Promise<PlanogramRow[]> {
    const [entries, milSettings] = await Promise.all([
      planogramRepository.listByBranch(tenantId, branchId),
      planogramRepository.listMilByBranch(tenantId, branchId),
    ]);

    const milByModel = new Map(milSettings.map((m: { modelId: string; daysThreshold: number }) => [m.modelId, m.daysThreshold]));

    const rows = await Promise.all(
      entries.map(async (entry: { id: string; branchId: string; modelId: string; maxQty: number; model: { id: string; skuCode: string; name: string; status: string; brand: { name: string } | null } }) => {
        const stockCount = await planogramRepository.countStockForModel(
          tenantId,
          branchId,
          entry.modelId,
        );
        return {
          id: entry.id,
          branchId: entry.branchId,
          modelId: entry.modelId,
          maxQty: entry.maxQty,
          stockCount,
          daysThreshold: milByModel.get(entry.modelId) ?? null,
          model: entry.model,
        };
      }),
    );

    return rows;
  },

  async addModel(input: {
    tenantId: string;
    actorUserId: string;
    branchId: string;
    modelId: string;
    maxQty: number;
    daysThreshold?: number;
  }) {
    if (input.maxQty < 1) {
      throw new Error("Max quantity must be at least 1");
    }

    const model = await masterDataRepository.findModel(input.tenantId, input.modelId);
    if (!model) throw new Error(`Model not found: ${input.modelId} (tenant: ${input.tenantId})`);
    if (model.status !== "active") throw new Error("Only active SKUs can be added to a planogram");

    const existing = await planogramRepository.findPlanogramEntry(
      input.tenantId,
      input.branchId,
      input.modelId,
    );
    if (existing) throw new Error("Model is already on this branch planogram");

    const entry = await planogramRepository.createEntry(input.tenantId, {
      branchId: input.branchId,
      modelId: input.modelId,
      maxQty: input.maxQty,
    });

    const milDays = input.daysThreshold ?? 30;
    if (milDays >= 1) {
      await planogramRepository.upsertMil(input.tenantId, {
        branchId: input.branchId,
        modelId: input.modelId,
        daysThreshold: milDays,
      });
    }

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "planogram.model_added",
      entityType: "BranchPlanogram",
      entityId: entry.id,
      metadata: { branchId: input.branchId, modelId: input.modelId, maxQty: input.maxQty },
    });

    return entry;
  },

  async updateMaxQty(input: {
    tenantId: string;
    actorUserId: string;
    planogramId: string;
    maxQty: number;
  }) {
    if (input.maxQty < 1) throw new Error("Max quantity must be at least 1");

    const entry = await planogramRepository.findPlanogramEntryById(
      input.tenantId,
      input.planogramId,
    );
    if (!entry) throw new Error("Planogram entry not found");

    await planogramRepository.updateMaxQty(input.tenantId, input.planogramId, input.maxQty);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "planogram.max_qty_updated",
      entityType: "BranchPlanogram",
      entityId: input.planogramId,
      metadata: { maxQty: input.maxQty },
    });
  },

  async updateMilDays(input: {
    tenantId: string;
    actorUserId: string;
    branchId: string;
    modelId: string;
    daysThreshold: number;
  }) {
    if (input.daysThreshold < 1) {
      throw new Error("MIL days threshold must be at least 1");
    }

    const entry = await planogramRepository.findPlanogramEntry(
      input.tenantId,
      input.branchId,
      input.modelId,
    );
    if (!entry) throw new Error("Model must be on planogram before setting MIL");

    await planogramRepository.upsertMil(input.tenantId, {
      branchId: input.branchId,
      modelId: input.modelId,
      daysThreshold: input.daysThreshold,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "planogram.mil_updated",
      entityType: "BranchMilSetting",
      entityId: `${input.branchId}:${input.modelId}`,
      metadata: { daysThreshold: input.daysThreshold },
    });
  },

  async removeModel(input: {
    tenantId: string;
    actorUserId: string;
    planogramId: string;
  }) {
    const entry = await planogramRepository.findPlanogramEntryById(
      input.tenantId,
      input.planogramId,
    );
    if (!entry) throw new Error("Planogram entry not found");

    const openOrder = await planogramRepository.hasOpenOrdersForModel(
      input.tenantId,
      entry.branchId,
      entry.modelId,
    );
    if (openOrder) {
      throw new Error("Cannot remove model with open pending orders");
    }

    await planogramRepository.deleteMil(input.tenantId, entry.branchId, entry.modelId);
    await planogramRepository.deleteEntry(input.tenantId, input.planogramId);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "planogram.model_removed",
      entityType: "BranchPlanogram",
      entityId: input.planogramId,
      metadata: { branchId: entry.branchId, modelId: entry.modelId },
    });
  },

  listActiveModelsForAdd(tenantId: string, branchId: string) {
    return masterDataRepository.listModels(tenantId).then(async (models: { id: string; skuCode: string; name: string; status: string }[]) => {
      const entries = await planogramRepository.listByBranch(tenantId, branchId) as { id: string; branchId: string; modelId: string; maxQty: number; model: { id: string; skuCode: string; name: string; status: string; brand: { name: string } | null } }[] | null;
      if (!entries) return [];
      const onPlanogram = new Set(entries.map((e: { modelId: string }) => e.modelId));
      return models.filter((m: { id: string; status: string; skuCode: string; name: string }) => m.status === "active" && !onPlanogram.has(m.id));
    });
  },

  async getMilAndCapacityAlerts(tenantId: string, branchIds: string[] | null) {
    const entries = await planogramRepository.listBelowCapacityAndMilBreaches(
      tenantId,
      branchIds,
    );

    const stkCode = await reasonStatusRepository.findCodeId(
      tenantId,
      "inventory_system",
      "STK",
    );

    let belowCapacity = 0;
    let milBreaches = 0;
    const now = Date.now();

    for (const entry of entries) {
      const [stockCount, mil, oldestStock] = await Promise.all([
        planogramRepository.countStockForModel(tenantId, entry.branchId, entry.modelId),
        planogramRepository.findMilSetting(tenantId, entry.branchId, entry.modelId),
        stkCode
          ? planogramRepository.findOldestStockForModel(
              tenantId,
              entry.branchId,
              entry.modelId,
              stkCode.id,
            )
          : Promise.resolve(null),
      ]);

      if (stockCount < entry.maxQty) belowCapacity += 1;

      if (mil && oldestStock) {
        const ageDays = (now - oldestStock.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > mil.daysThreshold) milBreaches += 1;
      }
    }

    return { belowCapacity, milBreaches };
  },

  listModelsForOrder(tenantId: string, branchId: string, orderType: string) {
    if (orderType === "special") {
      return masterDataRepository.listModels(tenantId).then((models: { id: string; skuCode: string; name: string; status: string }[]) =>
        models
          .filter((m: { status: string }) => m.status === "active")
          .map((m: { id: string; skuCode: string; name: string }) => ({ id: m.id, sku: m.skuCode, name: m.name })),
      );
    }
    return planogramRepository.listPlanogramModelsForOrder(tenantId, branchId).then((rows: { model: { id: string; skuCode: string; name: string } }[]) =>
      rows.map((r: { model: { id: string; skuCode: string; name: string } }) => ({
        id: r.model.id,
        sku: r.model.skuCode,
        name: r.model.name,
      })),
    );
  },

  async validateOrderLines(
    tenantId: string,
    branchId: string,
    orderType: string,
    details: { modelId: string; quantity: number }[],
  ) {
    if (details.length === 0) {
      throw new Error("Order must include at least one line");
    }

    for (const line of details) {
      if (line.quantity < 1) {
        throw new Error("Quantity must be at least 1");
      }

      const model = await masterDataRepository.findModel(tenantId, line.modelId);
      if (!model) throw new Error("Model not found");
      if (model.status !== "active") {
        throw new Error(`SKU ${model.skuCode} is not active (${model.status})`);
      }

      if (orderType === "special") continue;

      const entry = await planogramRepository.findPlanogramEntry(
        tenantId,
        branchId,
        line.modelId,
      );
      if (!entry) {
        throw new Error(
          `SKU ${model.skuCode} is not on the branch planogram. Use a special order for off-planogram SKUs.`,
        );
      }

      const stockCount = await planogramRepository.countStockForModel(
        tenantId,
        branchId,
        line.modelId,
      );
      const remainingCapacity = Math.max(0, entry.maxQty - stockCount);
      if (line.quantity > remainingCapacity) {
        throw new Error(
          `Quantity for ${model.skuCode} exceeds shelf capacity (${remainingCapacity} remaining of ${entry.maxQty} max)`,
        );
      }
    }
  },
};
