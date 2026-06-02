import { auditService } from "@/features/audit/services/audit.service";

import { aorService } from "@/features/aors/services/aor.service";

import { inventoryRepository } from "@/features/inventory/repositories/inventory.repository";

import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";



export const inventoryService = {

  async listForUser(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    pagination?: { page?: number; limit?: number },
    filters?: {
      branchId?: string;
      skuCode?: string;
      offPlanogramOnly?: boolean;
    },
  ) {
    const branchIds = isUnrestricted
      ? undefined
      : await aorService.getBranchIdsForUser(tenantId, userId);

    if (!isUnrestricted && (!branchIds || branchIds.length === 0)) {
      return inventoryRepository.listByBranches(tenantId, [], pagination, filters);
    }

    const allBranches = branchIds ?? [];
    if (isUnrestricted) {
      const { branchRepository } = await import(
        "@/features/branches/repositories/branch.repository"
      );
      const branches = await branchRepository.listByTenant(tenantId);
      const result = await inventoryRepository.listByBranches(
        tenantId,
        branches.map((b) => b.id),
        pagination,
        filters,
      );
      return this.enrichWithPlanogramFlags(tenantId, result);
    }

    const result = await inventoryRepository.listByBranches(
      tenantId,
      allBranches,
      pagination,
      filters,
    );
    return this.enrichWithPlanogramFlags(tenantId, result);
  },

  async enrichWithPlanogramFlags<
    T extends {
      items: { branchId: string; serialNumber: { model: { id: string } } }[];
    },
  >(tenantId: string, result: T) {
    const { planogramRepository } = await import(
      "@/features/planogram/repositories/planogram.repository"
    );

    // Batch: one query for all (branch, model) pairs on the page instead of N.
    const pairs = result.items.map((item) => ({
      branchId: item.branchId,
      modelId: item.serialNumber.model.id,
    }));
    const onPlanogramKeys = await planogramRepository.findOnPlanogramPairs(tenantId, pairs);

    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        onPlanogram: onPlanogramKeys.has(
          `${item.branchId}:${item.serialNumber.model.id}`,
        ),
      })),
    };
  },



  async getKpis(tenantId: string, branchIds: string[]) {

    const stkCode = await reasonStatusRepository.findCodeId(

      tenantId,

      "inventory_system",

      "STK",

    );

    const [stockCount, statusGroups] = await Promise.all([

      stkCode

        ? inventoryRepository.countByStatusCode(tenantId, branchIds, stkCode.id)

        : Promise.resolve(0),

      inventoryRepository.countByStatus(tenantId, branchIds),

    ]);

    return { stockCount, statusGroups };

  },



  async updateStatus(input: {
    tenantId: string;
    actorUserId: string;
    inventoryId: string;
    statusCodeId: string;
  }) {
    const codes = await reasonStatusRepository.listActiveCodesByCategory(
      input.tenantId,
      "inventory_system",
    );
    const target = codes.find((c) => c.id === input.statusCodeId);
    if (!target) {
      throw new Error("Invalid inventory status code");
    }

    const item = await inventoryRepository.updateStatus(
      input.tenantId,
      input.inventoryId,
      input.statusCodeId,
      input.actorUserId,
    );
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "inventory.status_updated",
      entityType: "BranchInventory",
      entityId: item.id,
      metadata: { statusCode: target.code, statusName: target.name },
    });
    return item;
  },
};


