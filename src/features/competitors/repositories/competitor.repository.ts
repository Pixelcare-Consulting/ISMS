import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/client";

const observationInclude = {
  branch: { select: { id: true, name: true, sapCode: true } },
  brand: { select: { id: true, name: true } },
  model: { select: { id: true, name: true, skuCode: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

export type CompetitorObservationListItem = Prisma.CompetitorObservationGetPayload<{
  include: typeof observationInclude;
}>;

export interface CompetitorListFilter {
  branchId?: string | null;
  brandId?: string | null;
  competitorName?: string | null;
  from?: Date | null;
  to?: Date | null;
  /** AOR-scoped branch ids; null = no restriction */
  scopedBranchIds?: string[] | null;
}

function buildWhere(
  tenantId: string,
  filter: CompetitorListFilter = {},
): Prisma.CompetitorObservationWhereInput {
  const where: Prisma.CompetitorObservationWhereInput = { tenantId };

  if (filter.scopedBranchIds && filter.scopedBranchIds.length > 0) {
    where.branchId = { in: filter.scopedBranchIds };
  }

  if (filter.branchId) {
    where.branchId = filter.branchId;
  }

  if (filter.brandId) {
    where.brandId = filter.brandId;
  }

  if (filter.competitorName?.trim()) {
    where.competitorName = {
      contains: filter.competitorName.trim(),
      mode: "insensitive",
    };
  }

  if (filter.from || filter.to) {
    where.observedAt = {};
    if (filter.from) where.observedAt.gte = filter.from;
    if (filter.to) where.observedAt.lte = filter.to;
  }

  return where;
}

export const competitorRepository = {
  list(tenantId: string, filter: CompetitorListFilter = {}) {
    return prisma.competitorObservation.findMany({
      where: buildWhere(tenantId, filter),
      include: observationInclude,
      orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.competitorObservation.findFirst({
      where: { id, tenantId },
      include: observationInclude,
    });
  },

  create(
    tenantId: string,
    data: {
      competitorName: string;
      branchId?: string | null;
      brandId?: string | null;
      modelId?: string | null;
      price?: number | null;
      notes?: string | null;
      observedAt: Date;
      createdById: string;
    },
  ) {
    return prisma.competitorObservation.create({
      data: {
        tenantId,
        competitorName: data.competitorName,
        branchId: data.branchId ?? null,
        brandId: data.brandId ?? null,
        modelId: data.modelId ?? null,
        price: data.price ?? null,
        notes: data.notes ?? null,
        observedAt: data.observedAt,
        createdById: data.createdById,
      },
      include: observationInclude,
    });
  },

  update(
    tenantId: string,
    id: string,
    data: {
      competitorName: string;
      branchId?: string | null;
      brandId?: string | null;
      modelId?: string | null;
      price?: number | null;
      notes?: string | null;
      observedAt: Date;
    },
  ) {
    return prisma.competitorObservation.update({
      where: { id },
      data: {
        competitorName: data.competitorName,
        branchId: data.branchId ?? null,
        brandId: data.brandId ?? null,
        modelId: data.modelId ?? null,
        price: data.price ?? null,
        notes: data.notes ?? null,
        observedAt: data.observedAt,
      },
      include: observationInclude,
    });
  },

  delete(tenantId: string, id: string) {
    return prisma.competitorObservation.deleteMany({
      where: { id, tenantId },
    });
  },

  async getKpis(tenantId: string, scopedBranchIds: string[] | null) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const baseWhere: Prisma.CompetitorObservationWhereInput = {
      tenantId,
      ...(scopedBranchIds && scopedBranchIds.length > 0
        ? { branchId: { in: scopedBranchIds } }
        : {}),
    };

    const [entriesThisMonth, distinctRows, avgAgg] = await Promise.all([
      prisma.competitorObservation.count({
        where: { ...baseWhere, observedAt: { gte: monthStart } },
      }),
      prisma.competitorObservation.findMany({
        where: baseWhere,
        select: { competitorName: true },
        distinct: ["competitorName"],
      }),
      prisma.competitorObservation.aggregate({
        where: { ...baseWhere, price: { not: null } },
        _avg: { price: true },
      }),
    ]);

    const avgPrice = avgAgg._avg.price;
    return {
      entriesThisMonth,
      distinctCompetitors: distinctRows.length,
      avgPrice: avgPrice != null ? Number(avgPrice) : null,
    };
  },
};
