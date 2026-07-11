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

export const aorService = {
  listAors(tenantId: string) {
    return aorRepository.listByTenant(tenantId);
  },

  async getBranchIdsForUser(tenantId: string, userId: string) {
    return aorRepository.listExistingBranchIds(tenantId, userId);
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
