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
  ) {
    const branchIds = isUnrestricted
      ? undefined
      : await aorService.getBranchIdsForUser(tenantId, userId);

    if (!isUnrestricted && (!branchIds || branchIds.length === 0)) {
      return inventoryRepository.listByBranches(tenantId, [], pagination);
    }

    const allBranches = branchIds ?? [];
    if (isUnrestricted) {
      const { branchRepository } = await import(
        "@/features/branches/repositories/branch.repository"
      );
      const branches = await branchRepository.listByTenant(tenantId);
      return inventoryRepository.listByBranches(
        tenantId,
        branches.map((b) => b.id),
        pagination,
      );
    }

    return inventoryRepository.listByBranches(tenantId, allBranches, pagination);
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


