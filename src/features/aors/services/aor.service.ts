import { auditService } from "@/features/audit/services/audit.service";
import { aorRepository } from "@/features/aors/repositories/aor.repository";
import { z } from "zod";

const createAorSchema = z.object({
  userId: z.string().min(1),
  branchId: z.string().optional().nullable(),
  warehouseId: z.string().optional().nullable(),
});

export const aorService = {
  listAors(tenantId: string) {
    return aorRepository.listByTenant(tenantId);
  },

  async getBranchIdsForUser(tenantId: string, userId: string) {
    const rows = await aorRepository.listBranchIdsForUser(tenantId, userId);
    return rows.map((r) => r.branchId).filter((id): id is string => id !== null);
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

    const aor = await aorRepository.create(input.tenantId, parsed.data);
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
