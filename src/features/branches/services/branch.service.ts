import { auditService } from "@/features/audit/services/audit.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { z } from "zod";

const createBranchSchema = z.object({
  sapCode: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  areaId: z.string().optional().nullable(),
  branchAreaId: z.string().optional().nullable(),
  dealerId: z.string().optional().nullable(),
  primaryWarehouseId: z.string().optional().nullable(),
  regionId: z.string().optional().nullable(),
  provinceId: z.string().optional().nullable(),
  alternateWarehouseIds: z.array(z.string()).optional(),
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

  listFormOptions(tenantId: string) {
    return branchRepository.listFormOptions(tenantId);
  },

  async createBranch(input: {
    tenantId: string;
    actorUserId: string;
    sapCode: string;
    name: string;
    areaId?: string | null;
    branchAreaId?: string | null;
    dealerId?: string | null;
    primaryWarehouseId?: string | null;
    regionId?: string | null;
    provinceId?: string | null;
    alternateWarehouseIds?: string[];
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
    areaId?: string | null;
    branchAreaId?: string | null;
    dealerId?: string | null;
    primaryWarehouseId?: string | null;
    regionId?: string | null;
    provinceId?: string | null;
    alternateWarehouseIds?: string[];
    status?: "active" | "inactive";
  }) {
    const parsed = updateBranchSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await branchRepository.findById(input.tenantId, parsed.data.branchId);
    if (!existing) throw new Error("Branch not found");

    try {
      const { branchId, ...data } = parsed.data;
      const branch = await branchRepository.update(input.tenantId, branchId, data);
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
