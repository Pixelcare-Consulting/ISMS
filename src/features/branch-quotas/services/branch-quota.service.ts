import { auditService } from "@/features/audit/services/audit.service";
import { branchQuotaRepository } from "@/features/branch-quotas/repositories/branch-quota.repository";
import { branchQuotaFormSchema } from "@/features/branch-quotas/schemas/branch-quota.schema";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { prisma } from "@/lib/database/client";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

function parseQuotaMonth(value: string): Date {
  // Accept YYYY-MM or YYYY-MM-DD
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) throw new Error("Invalid quota month");
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  return new Date(Date.UTC(year, month, 1));
}

export const branchQuotaService = {
  list(tenantId: string) {
    return branchQuotaRepository.listByTenant(tenantId);
  },

  async listFormOptions(tenantId: string) {
    const [branches, brands] = await Promise.all([
      prisma.branch.findMany({
        where: { tenantId, deletedAt: null, status: "active" },
        select: { id: true, name: true, sapCode: true },
        orderBy: { name: "asc" },
      }),
      masterDataRepository.listBrands(tenantId),
    ]);
    return { branches, brands };
  },

  async create(input: {
    tenantId: string;
    actorUserId: string;
    branchId: string;
    brandId: string;
    quotaDate: string;
    quotaAmount: number;
  }) {
    const parsed = branchQuotaFormSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    try {
      const row = await branchQuotaRepository.create(input.tenantId, {
        branchId: parsed.data.branchId,
        brandId: parsed.data.brandId,
        quotaDate: parseQuotaMonth(parsed.data.quotaDate),
        quotaAmount: parsed.data.quotaAmount,
      });
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "branch_quota.created",
        entityType: "BranchQuota",
        entityId: row.id,
        metadata: {
          branchId: row.branchId,
          brandId: row.brandId,
          quotaAmount: Number(row.quotaAmount),
        },
      });
      return row;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("A quota already exists for this branch, brand, and month");
      }
      throw error;
    }
  },

  async update(input: {
    tenantId: string;
    actorUserId: string;
    id: string;
    branchId: string;
    brandId: string;
    quotaDate: string;
    quotaAmount: number;
  }) {
    const parsed = branchQuotaFormSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await branchQuotaRepository.findById(input.tenantId, input.id);
    if (!existing) throw new Error("Quota not found");

    try {
      const row = await branchQuotaRepository.update(input.tenantId, input.id, {
        branchId: parsed.data.branchId,
        brandId: parsed.data.brandId,
        quotaDate: parseQuotaMonth(parsed.data.quotaDate),
        quotaAmount: parsed.data.quotaAmount,
      });
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "branch_quota.updated",
        entityType: "BranchQuota",
        entityId: row.id,
        metadata: {
          branchId: row.branchId,
          brandId: row.brandId,
          quotaAmount: Number(row.quotaAmount),
        },
      });
      return row;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("A quota already exists for this branch, brand, and month");
      }
      throw error;
    }
  },

  async delete(input: { tenantId: string; actorUserId: string; id: string }) {
    const existing = await branchQuotaRepository.findById(input.tenantId, input.id);
    if (!existing) throw new Error("Quota not found");

    await branchQuotaRepository.delete(input.tenantId, input.id);
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "branch_quota.deleted",
      entityType: "BranchQuota",
      entityId: existing.id,
      metadata: {
        branchId: existing.branchId,
        brandId: existing.brandId,
      },
    });
  },

  async assertWithinQuota(
    tenantId: string,
    branchId: string,
    details: { modelId: string; quantity: number }[],
  ) {
    const now = new Date();
    const qtyByBrand = new Map<string, number>();

    for (const line of details) {
      const model = await masterDataRepository.findModel(tenantId, line.modelId);
      if (!model?.brandId) continue;
      qtyByBrand.set(model.brandId, (qtyByBrand.get(model.brandId) ?? 0) + line.quantity);
    }

    for (const [brandId, newQty] of qtyByBrand) {
      const quota = await branchQuotaRepository.findForMonth(
        tenantId,
        branchId,
        brandId,
        now,
      );
      if (!quota) continue;

      const existingQty = await branchQuotaRepository.sumOrderedQtyForBrandInMonth(
        tenantId,
        branchId,
        brandId,
        now,
      );
      const limit = Number(quota.quotaAmount);
      const remaining = Math.max(0, limit - existingQty);
      if (existingQty + newQty > limit) {
        throw new Error(
          `Monthly brand quota exceeded (remaining ${remaining} of ${limit}). Reduce quantity or update Branch Quotas.`,
        );
      }
    }
  },
};
