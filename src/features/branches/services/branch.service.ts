import { auditService } from "@/features/audit/services/audit.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { z } from "zod";

const createBranchSchema = z.object({
  sapCode: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  branchAreaId: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

const updateBranchSchema = createBranchSchema.extend({
  branchId: z.string().min(1),
});

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

export const branchService = {
  listBranches(tenantId: string) {
    return branchRepository.listByTenant(tenantId);
  },

  listAreas(tenantId: string) {
    return branchRepository.listAreas(tenantId);
  },

  async createBranch(input: {
    tenantId: string;
    actorUserId: string;
    sapCode: string;
    name: string;
    branchAreaId?: string | null;
    status?: "active" | "inactive";
  }) {
    const parsed = createBranchSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    try {
      const branch = await branchRepository.create(input.tenantId, parsed.data);
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "branch.created",
        entityType: "Branch",
        entityId: branch.id,
        metadata: { name: branch.name, sapCode: branch.sapCode },
      });
      return branch;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("A branch with this SAP code already exists");
      }
      throw error;
    }
  },

  async updateBranch(input: {
    tenantId: string;
    actorUserId: string;
    branchId: string;
    sapCode: string;
    name: string;
    branchAreaId?: string | null;
    status?: "active" | "inactive";
  }) {
    const parsed = updateBranchSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await branchRepository.findById(input.tenantId, parsed.data.branchId);
    if (!existing) throw new Error("Branch not found");

    try {
      const branch = await branchRepository.update(input.tenantId, parsed.data.branchId, {
        sapCode: parsed.data.sapCode,
        name: parsed.data.name,
        branchAreaId: parsed.data.branchAreaId,
        status: parsed.data.status,
      });
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "branch.updated",
        entityType: "Branch",
        entityId: branch.id,
        metadata: { name: branch.name },
      });
      return branch;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("A branch with this SAP code already exists");
      }
      throw error;
    }
  },

  async deleteBranch(input: {
    tenantId: string;
    actorUserId: string;
    branchId: string;
  }) {
    const branch = await branchRepository.findById(input.tenantId, input.branchId);
    if (!branch) throw new Error("Branch not found");

    await branchRepository.softDelete(input.tenantId, input.branchId);
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "branch.deleted",
      entityType: "Branch",
      entityId: branch.id,
      metadata: { name: branch.name },
    });
  },
};
