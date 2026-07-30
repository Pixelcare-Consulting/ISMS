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
import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";

export interface CompetitorObservationDto {
  id: string;
  competitorId: string;
  competitorName: string;
  branchId: string | null;
  competitorBrandId: string | null;
  competitorModelId: string | null;
  brandName: string | null;
  modelName: string | null;
  price: number | null;
  promotion: string | null;
  notes: string | null;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
  branch: { id: string; name: string; sapCode: string } | null;
  competitorBrand: { id: string; name: string } | null;
  competitorModel: { id: string; name: string } | null;
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
    competitorBrandId: row.competitorBrandId,
    competitorModelId: row.competitorModelId,
    brandName: row.brandName,
    modelName: row.modelName,
    price: row.price != null ? Number(row.price) : null,
    promotion: row.promotion,
    notes: row.notes,
    observedAt: row.observedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    branch: row.branch,
    competitorBrand: row.competitorBrand,
    competitorModel: row.competitorModel,
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

async function resolveCompetitorBrandAndModel(
  tenantId: string,
  competitorBrandId: string | null | undefined,
  competitorModelId: string | null | undefined,
): Promise<{
  competitorBrandId: string | null;
  competitorModelId: string | null;
  brandName: string | null;
  modelName: string | null;
}> {
  let brandName: string | null = null;
  let modelName: string | null = null;
  let resolvedBrandId: string | null = competitorBrandId ?? null;
  let resolvedModelId: string | null = competitorModelId ?? null;

  if (resolvedBrandId) {
    const brand = await prisma.competitorBrand.findFirst({
      where: { id: resolvedBrandId, tenantId, recordStatus: "active" },
      select: { id: true, name: true },
    });
    if (!brand) throw new Error("Competitor brand not found or inactive");
    brandName = brand.name;
  }

  if (resolvedModelId) {
    const model = await prisma.competitorModel.findFirst({
      where: { id: resolvedModelId, tenantId, recordStatus: "active" },
      select: { id: true, name: true, competitorBrandId: true },
    });
    if (!model) throw new Error("Competitor model not found or inactive");
    if (resolvedBrandId && model.competitorBrandId !== resolvedBrandId) {
      throw new Error("Model does not belong to the selected competitor brand");
    }
    if (!resolvedBrandId) {
      const brand = await prisma.competitorBrand.findFirst({
        where: { id: model.competitorBrandId, tenantId },
        select: { id: true, name: true },
      });
      if (!brand) throw new Error("Competitor brand not found for model");
      resolvedBrandId = brand.id;
      brandName = brand.name;
    }
    resolvedModelId = model.id;
    modelName = model.name;
  }

  return {
    competitorBrandId: resolvedBrandId,
    competitorModelId: resolvedModelId,
    brandName,
    modelName,
  };
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
      prisma.competitorBrand.findMany({
        where: { tenantId, recordStatus: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.competitorModel.findMany({
        where: { tenantId, recordStatus: "active" },
        select: { id: true, name: true, competitorBrandId: true },
        orderBy: { name: "asc" },
      }),
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
        competitorBrandId: m.competitorBrandId,
        label: m.name,
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
    competitorBrandId?: string | null;
    competitorModelId?: string | null;
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
    const brandModel = await resolveCompetitorBrandAndModel(
      input.tenantId,
      parsed.data.competitorBrandId,
      parsed.data.competitorModelId,
    );

    const row = await competitorRepository.create(input.tenantId, {
      competitorId: competitor.id,
      competitorName: competitor.name,
      branchId,
      competitorBrandId: brandModel.competitorBrandId,
      competitorModelId: brandModel.competitorModelId,
      brandName: brandModel.brandName,
      modelName: brandModel.modelName,
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
    competitorBrandId?: string | null;
    competitorModelId?: string | null;
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
    const brandModel = await resolveCompetitorBrandAndModel(
      input.tenantId,
      parsed.data.competitorBrandId,
      parsed.data.competitorModelId,
    );

    const row = await competitorRepository.update(input.tenantId, parsed.data.id, {
      competitorId: competitor.id,
      competitorName: competitor.name,
      branchId,
      competitorBrandId: brandModel.competitorBrandId,
      competitorModelId: brandModel.competitorModelId,
      brandName: brandModel.brandName,
      modelName: brandModel.modelName,
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
