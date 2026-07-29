import { auditService } from "@/features/audit/services/audit.service";
import {
  competitorRepository,
  type CompetitorListFilter,
  type CompetitorObservationListItem,
} from "@/features/competitors/repositories/competitor.repository";
import {
  createCompetitorObservationSchema,
  updateCompetitorObservationSchema,
} from "@/features/competitors/schemas/competitor.schema";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";

export interface CompetitorObservationDto {
  id: string;
  competitorId: string;
  competitorName: string;
  branchId: string | null;
  brandId: string | null;
  modelId: string | null;
  price: number | null;
  promotion: string | null;
  notes: string | null;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
  branch: { id: string; name: string; sapCode: string } | null;
  brand: { id: string; name: string } | null;
  model: { id: string; name: string; skuCode: string } | null;
  createdBy: { id: string; name: string | null; email: string };
}

export interface CompetitorKpis {
  entriesThisMonth: number;
  distinctCompetitors: number;
  avgPrice: number | null;
}

const WRITE_BRANCH_AOR_ERROR =
  "Competitor observations require exactly one branch assigned in your AOR";

function toDto(row: CompetitorObservationListItem): CompetitorObservationDto {
  return {
    id: row.id,
    competitorId: row.competitorId,
    competitorName: row.competitorName,
    branchId: row.branchId,
    brandId: row.brandId,
    modelId: row.modelId,
    price: row.price != null ? Number(row.price) : null,
    promotion: row.promotion,
    notes: row.notes,
    observedAt: row.observedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    branch: row.branch,
    brand: row.brand,
    model: row.model,
    createdBy: row.createdBy,
  };
}

async function resolveScopedBranchIds(
  tenantId: string,
  userId: string,
  hasFullAccess: boolean,
): Promise<string[] | null> {
  if (hasFullAccess) return null;
  return getUserBranchIds(tenantId, userId);
}

function assertBranchInScope(branchId: string | null | undefined, scopedBranchIds: string[] | null) {
  if (!branchId || !scopedBranchIds || scopedBranchIds.length === 0) return;
  if (!scopedBranchIds.includes(branchId)) {
    throw new Error("Branch is outside your area of responsibility");
  }
}

/** Writes never bypass AOR via hasFullAccess — exactly one branch required. */
async function resolveWriteBranchId(tenantId: string, userId: string): Promise<string> {
  const branchIds = await getUserBranchIds(tenantId, userId);
  if (!branchIds || branchIds.length !== 1) {
    throw new Error(WRITE_BRANCH_AOR_ERROR);
  }
  return branchIds[0]!;
}

async function resolveActiveCompetitor(tenantId: string, competitorId: string) {
  const competitor = await prisma.competitor.findFirst({
    where: { id: competitorId, tenantId, recordStatus: "active" },
    select: { id: true, name: true },
  });
  if (!competitor) {
    throw new Error("Competitor not found or inactive");
  }
  return competitor;
}

async function assertModelMatchesBrand(
  tenantId: string,
  modelId: string | null | undefined,
  brandId: string | null | undefined,
) {
  if (!modelId) return;
  const model = await prisma.productModel.findFirst({
    where: { id: modelId, tenantId },
    select: { id: true, brandId: true },
  });
  if (!model) throw new Error("Model not found");
  if (brandId && model.brandId && brandId !== model.brandId) {
    throw new Error("Model does not belong to the selected brand");
  }
}

export const competitorService = {
  async list(
    tenantId: string,
    userId: string,
    hasFullAccess: boolean,
    filter: Omit<CompetitorListFilter, "scopedBranchIds"> = {},
  ) {
    const scopedBranchIds = await resolveScopedBranchIds(tenantId, userId, hasFullAccess);
    if (filter.branchId) {
      assertBranchInScope(filter.branchId, scopedBranchIds);
    }
    const rows = await competitorRepository.list(tenantId, {
      ...filter,
      scopedBranchIds,
    });
    return rows.map(toDto);
  },

  async getKpis(tenantId: string, userId: string, hasFullAccess: boolean): Promise<CompetitorKpis> {
    const scopedBranchIds = await resolveScopedBranchIds(tenantId, userId, hasFullAccess);
    return competitorRepository.getKpis(tenantId, scopedBranchIds);
  },

  async listFormOptions(tenantId: string, userId: string, hasFullAccess: boolean) {
    const scopedBranchIds = await resolveScopedBranchIds(tenantId, userId, hasFullAccess);
    const [allBranches, brands, models, competitors] = await Promise.all([
      branchRepository.listByTenant(tenantId),
      masterDataRepository.listBrands(tenantId),
      masterDataRepository.listModels(tenantId),
      prisma.competitor.findMany({
        where: { tenantId, recordStatus: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const branches =
      scopedBranchIds && scopedBranchIds.length > 0
        ? allBranches.filter((b) => scopedBranchIds.includes(b.id))
        : allBranches;

    return {
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        sapCode: b.sapCode,
        label: `${b.name} (${b.sapCode})`,
      })),
      brands: brands.map((b) => ({
        id: b.id,
        name: b.name,
        label: b.name,
      })),
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        skuCode: m.skuCode,
        brandId: m.brandId,
        label: `${m.skuCode} — ${m.name}`,
      })),
      competitors: competitors.map((c) => ({
        id: c.id,
        name: c.name,
        label: c.name,
      })),
    };
  },

  async create(input: {
    tenantId: string;
    actorUserId: string;
    competitorId: string;
    brandId?: string | null;
    modelId?: string | null;
    price?: number | null;
    promotion?: string | null;
    notes?: string | null;
    observedAt: Date;
  }) {
    const parsed = createCompetitorObservationSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const branchId = await resolveWriteBranchId(input.tenantId, input.actorUserId);
    const competitor = await resolveActiveCompetitor(input.tenantId, parsed.data.competitorId);
    await assertModelMatchesBrand(input.tenantId, parsed.data.modelId, parsed.data.brandId);

    const row = await competitorRepository.create(input.tenantId, {
      competitorId: competitor.id,
      competitorName: competitor.name,
      branchId,
      brandId: parsed.data.brandId,
      modelId: parsed.data.modelId,
      price: parsed.data.price,
      promotion: parsed.data.promotion,
      notes: parsed.data.notes,
      observedAt: parsed.data.observedAt,
      createdById: input.actorUserId,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "competitor.created",
      entityType: "CompetitorObservation",
      entityId: row.id,
      metadata: { competitorId: row.competitorId, competitorName: row.competitorName },
    });

    return toDto(row);
  },

  async update(input: {
    tenantId: string;
    actorUserId: string;
    id: string;
    competitorId: string;
    brandId?: string | null;
    modelId?: string | null;
    price?: number | null;
    promotion?: string | null;
    notes?: string | null;
    observedAt: Date;
  }) {
    const parsed = updateCompetitorObservationSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await competitorRepository.findById(input.tenantId, parsed.data.id);
    if (!existing) throw new Error("Observation not found");

    const branchId = await resolveWriteBranchId(input.tenantId, input.actorUserId);
    if (existing.branchId && existing.branchId !== branchId) {
      throw new Error("Observation is outside your area of responsibility");
    }

    const competitor = await resolveActiveCompetitor(input.tenantId, parsed.data.competitorId);
    await assertModelMatchesBrand(input.tenantId, parsed.data.modelId, parsed.data.brandId);

    const row = await competitorRepository.update(input.tenantId, parsed.data.id, {
      competitorId: competitor.id,
      competitorName: competitor.name,
      branchId,
      brandId: parsed.data.brandId,
      modelId: parsed.data.modelId,
      price: parsed.data.price,
      promotion: parsed.data.promotion,
      notes: parsed.data.notes,
      observedAt: parsed.data.observedAt,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "competitor.updated",
      entityType: "CompetitorObservation",
      entityId: row.id,
      metadata: { competitorId: row.competitorId, competitorName: row.competitorName },
    });

    return toDto(row);
  },

  async delete(input: { tenantId: string; actorUserId: string; id: string }) {
    const existing = await competitorRepository.findById(input.tenantId, input.id);
    if (!existing) throw new Error("Observation not found");

    const branchId = await resolveWriteBranchId(input.tenantId, input.actorUserId);
    if (existing.branchId && existing.branchId !== branchId) {
      throw new Error("Observation is outside your area of responsibility");
    }

    await competitorRepository.delete(input.tenantId, input.id);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "competitor.deleted",
      entityType: "CompetitorObservation",
      entityId: input.id,
      metadata: { competitorId: existing.competitorId, competitorName: existing.competitorName },
    });

    return { id: input.id };
  },
};
