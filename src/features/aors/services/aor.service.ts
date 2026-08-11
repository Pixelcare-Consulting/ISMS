import { auditService } from "@/features/audit/services/audit.service";
import { aorRepository } from "@/features/aors/repositories/aor.repository";
import { z } from "zod";

const createAorSchema = z.object({
  userId: z.string().min(1),
  branchId: z.string().optional().nullable(),
  warehouseId: z.string().optional().nullable(),
});

const createAorsBulkSchema = z.object({
  userId: z.string().min(1),
  branchIds: z.array(z.string().min(1)).optional().default([]),
  dealerIds: z.array(z.string().min(1)).optional().default([]),
});

const syncUserAorsSchema = z.object({
  userId: z.string().min(1),
  branchIds: z.array(z.string().min(1)).optional().default([]),
  dealerIds: z.array(z.string().min(1)).optional().default([]),
  warehouseIds: z.array(z.string().min(1)).optional().default([]),
  serviceCenterIds: z.array(z.string().min(1)).optional().default([]),
});

export const aorService = {
  listAors(tenantId: string) {
    return aorRepository.listByTenant(tenantId);
  },

  listAorsForUser(tenantId: string, userId: string) {
    return aorRepository.listByUser(tenantId, userId);
  },

  async getBranchIdsForUser(tenantId: string, userId: string) {
    return aorRepository.listExistingBranchIds(tenantId, userId);
  },

  async getWarehouseIdsForUser(tenantId: string, userId: string) {
    return aorRepository.listExistingWarehouseIds(tenantId, userId);
  },

  async getServiceCenterIdsForUser(tenantId: string, userId: string) {
    return aorRepository.listExistingServiceCenterIds(tenantId, userId);
  },

  async createAor(input: {
    tenantId: string;
    actorUserId: string;
    userId: string;
    branchId?: string | null;
    warehouseId?: string | null;
  }) {
    const parsed = createAorSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    if (!parsed.data.branchId && !parsed.data.warehouseId) {
      throw new Error("Assign at least a branch or warehouse");
    }

    // Prefer branch fan-out path when only a branch is provided.
    if (parsed.data.branchId && !parsed.data.warehouseId) {
      const result = await this.createAorsBulk({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        userId: parsed.data.userId,
        branchIds: [parsed.data.branchId],
      });
      const aor = result.aors[0];
      if (!aor) {
        throw new Error("Branch is already assigned to this user");
      }
      return aor;
    }

    const aor = await aorRepository.create(input.tenantId, {
      ...parsed.data,
      createdById: input.actorUserId,
    });
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "aor.created",
      entityType: "Aor",
      entityId: aor.id,
      metadata: { userId: parsed.data.userId },
    });
    return aor;
  },

  async createAorsBulk(input: {
    tenantId: string;
    actorUserId: string;
    userId: string;
    branchIds?: string[];
    dealerIds?: string[];
  }) {
    const parsed = createAorsBulkSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const explicitBranchIds = [...new Set(parsed.data.branchIds)];
    const dealerIds = [...new Set(parsed.data.dealerIds)];

    if (explicitBranchIds.length === 0 && dealerIds.length === 0) {
      throw new Error("Select at least one branch or dealer");
    }

    const dealerBranches = await aorRepository.listBranchIdsByDealerIds(
      input.tenantId,
      dealerIds,
    );
    const dealerBranchIds = dealerBranches.map((branch) => branch.id);

    const targetBranchIds = [
      ...new Set([...explicitBranchIds, ...dealerBranchIds]),
    ];

    if (targetBranchIds.length === 0) {
      throw new Error("Selected dealers have no active branches");
    }

    const existingBranchIds = new Set(
      await aorRepository.listExistingBranchIds(input.tenantId, parsed.data.userId),
    );

    const toCreate = targetBranchIds.filter((id) => !existingBranchIds.has(id));
    const skippedCount = targetBranchIds.length - toCreate.length;

    const aors =
      toCreate.length === 0
        ? []
        : await aorRepository.createMany(
            input.tenantId,
            toCreate.map((branchId) => ({
              userId: parsed.data.userId,
              branchId,
              createdById: input.actorUserId,
            })),
          );

    if (aors.length > 0) {
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "aor.bulk_created",
        entityType: "Aor",
        entityId: aors[0].id,
        metadata: {
          userId: parsed.data.userId,
          createdCount: aors.length,
          skippedCount,
          branchIds: toCreate,
          dealerIds,
        },
      });
    }

    return { aors, createdCount: aors.length, skippedCount };
  },

  async syncUserAors(input: {
    tenantId: string;
    actorUserId: string;
    userId: string;
    branchIds?: string[];
    dealerIds?: string[];
    warehouseIds?: string[];
    serviceCenterIds?: string[];
  }) {
    const parsed = syncUserAorsSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const explicitBranchIds = [...new Set(parsed.data.branchIds)];
    const dealerIds = [...new Set(parsed.data.dealerIds)];
    const warehouseIds = [...new Set(parsed.data.warehouseIds)];
    const serviceCenterIds = [...new Set(parsed.data.serviceCenterIds)];

    if (
      explicitBranchIds.length === 0 &&
      dealerIds.length === 0 &&
      warehouseIds.length === 0 &&
      serviceCenterIds.length === 0
    ) {
      throw new Error(
        "Select at least one branch, dealer, warehouse, or service center",
      );
    }

    const dealerBranches = await aorRepository.listBranchIdsByDealerIds(
      input.tenantId,
      dealerIds,
    );
    const dealerBranchIds = dealerBranches.map((branch) => branch.id);
    const targetBranchIds = [
      ...new Set([...explicitBranchIds, ...dealerBranchIds]),
    ];

    if (
      dealerIds.length > 0 &&
      targetBranchIds.length === 0 &&
      warehouseIds.length === 0 &&
      serviceCenterIds.length === 0
    ) {
      throw new Error("Selected dealers have no active branches");
    }

    const existingBranchAors = await aorRepository.listBranchAorsForUser(
      input.tenantId,
      parsed.data.userId,
    );
    const existingWarehouseAors = await aorRepository.listWarehouseIdsForUser(
      input.tenantId,
      parsed.data.userId,
    );
    const existingDealerAors = await aorRepository.listDealerIdsForUser(
      input.tenantId,
      parsed.data.userId,
    );
    const existingServiceCenterAors =
      await aorRepository.listServiceCenterAorsForUser(
        input.tenantId,
        parsed.data.userId,
      );

    const existingBranchIds = new Set(
      existingBranchAors
        .map((row) => row.branchId)
        .filter((id): id is string => id !== null),
    );
    const existingWarehouseIds = new Set(
      existingWarehouseAors
        .map((row) => row.warehouseId)
        .filter((id): id is string => id !== null),
    );
    const existingDealerIds = new Set(
      existingDealerAors
        .map((row) => row.dealerId)
        .filter((id): id is string => id !== null),
    );
    const existingServiceCenterIds = new Set(
      existingServiceCenterAors
        .map((row) => row.serviceCenterId)
        .filter((id): id is string => id !== null),
    );

    const targetBranchSet = new Set(targetBranchIds);
    const targetWarehouseSet = new Set(warehouseIds);
    const targetDealerSet = new Set(dealerIds);
    const targetServiceCenterSet = new Set(serviceCenterIds);

    const branchIdsToCreate = targetBranchIds.filter(
      (id) => !existingBranchIds.has(id),
    );
    const warehouseIdsToCreate = warehouseIds.filter(
      (id) => !existingWarehouseIds.has(id),
    );
    const dealerIdsToCreate = dealerIds.filter(
      (id) => !existingDealerIds.has(id),
    );
    const serviceCenterIdsToCreate = serviceCenterIds.filter(
      (id) => !existingServiceCenterIds.has(id),
    );

    const branchIdsToDelete = existingBranchAors
      .filter(
        (row) => row.branchId !== null && !targetBranchSet.has(row.branchId),
      )
      .map((row) => row.id);
    const warehouseIdsToDelete = existingWarehouseAors
      .filter(
        (row) =>
          row.warehouseId !== null && !targetWarehouseSet.has(row.warehouseId),
      )
      .map((row) => row.id);
    const dealerIdsToDelete = existingDealerAors
      .filter(
        (row) => row.dealerId !== null && !targetDealerSet.has(row.dealerId),
      )
      .map((row) => row.id);
    const serviceCenterIdsToDelete = existingServiceCenterAors
      .filter(
        (row) =>
          row.serviceCenterId !== null &&
          !targetServiceCenterSet.has(row.serviceCenterId),
      )
      .map((row) => row.id);

    const idsToDelete = [
      ...branchIdsToDelete,
      ...warehouseIdsToDelete,
      ...dealerIdsToDelete,
      ...serviceCenterIdsToDelete,
    ];

    if (idsToDelete.length > 0) {
      await aorRepository.deleteMany(input.tenantId, idsToDelete);
    }

    const rowsToCreate = [
      ...branchIdsToCreate.map((branchId) => ({
        userId: parsed.data.userId,
        branchId,
        createdById: input.actorUserId,
      })),
      ...warehouseIdsToCreate.map((warehouseId) => ({
        userId: parsed.data.userId,
        warehouseId,
        createdById: input.actorUserId,
      })),
      ...dealerIdsToCreate.map((dealerId) => ({
        userId: parsed.data.userId,
        dealerId,
        createdById: input.actorUserId,
      })),
      ...serviceCenterIdsToCreate.map((serviceCenterId) => ({
        userId: parsed.data.userId,
        serviceCenterId,
        createdById: input.actorUserId,
      })),
    ];

    const createdAors =
      rowsToCreate.length === 0
        ? []
        : await aorRepository.createMany(input.tenantId, rowsToCreate);

    const deletedCount = idsToDelete.length;
    const createdCount = createdAors.length;

    if (createdCount > 0 || deletedCount > 0) {
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "aor.synced",
        entityType: "Aor",
        entityId: createdAors[0]?.id ?? idsToDelete[0] ?? parsed.data.userId,
        metadata: {
          userId: parsed.data.userId,
          createdCount,
          deletedCount,
          branchIds: targetBranchIds,
          dealerIds,
          warehouseIds,
          serviceCenterIds,
        },
      });
    }

    const aors = await aorRepository.listByUser(
      input.tenantId,
      parsed.data.userId,
    );

    return { aors, createdCount, deletedCount };
  },

  async deleteAor(input: { tenantId: string; actorUserId: string; aorId: string }) {
    await aorRepository.delete(input.tenantId, input.aorId);
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "aor.deleted",
      entityType: "Aor",
      entityId: input.aorId,
    });
  },
};
