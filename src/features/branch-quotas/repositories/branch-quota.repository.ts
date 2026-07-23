import { prisma } from "@/lib/database/client";

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthEndExclusive(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export const branchQuotaRepository = {
  listByTenant(tenantId: string) {
    return prisma.branchQuota.findMany({
      where: { tenantId },
      include: {
        branch: { select: { id: true, name: true, sapCode: true } },
        brand: { select: { id: true, name: true } },
      },
      orderBy: [{ quotaDate: "desc" }, { branch: { name: "asc" } }],
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.branchQuota.findFirst({
      where: { id, tenantId },
      include: {
        branch: { select: { id: true, name: true, sapCode: true } },
        brand: { select: { id: true, name: true } },
      },
    });
  },

  findForMonth(tenantId: string, branchId: string, brandId: string, month: Date) {
    return prisma.branchQuota.findUnique({
      where: {
        branchId_brandId_quotaDate: {
          branchId,
          brandId,
          quotaDate: monthStart(month),
        },
      },
    });
  },

  async sumOrderedQtyForBrandInMonth(
    tenantId: string,
    branchId: string,
    brandId: string,
    month: Date,
  ) {
    const from = monthStart(month);
    const to = monthEndExclusive(month);
    const aggregates = await prisma.branchOrderDetail.aggregate({
      where: {
        model: { brandId },
        order: {
          tenantId,
          branchId,
          status: { notIn: ["rejected", "cancelled"] },
          createdAt: { gte: from, lt: to },
        },
      },
      _sum: { quantity: true },
    });
    return aggregates._sum.quantity ?? 0;
  },

  create(
    tenantId: string,
    data: {
      branchId: string;
      brandId: string;
      quotaDate: Date;
      quotaAmount: number;
    },
  ) {
    return prisma.branchQuota.create({
      data: {
        tenantId,
        branchId: data.branchId,
        brandId: data.brandId,
        quotaDate: monthStart(data.quotaDate),
        quotaAmount: data.quotaAmount,
      },
      include: {
        branch: { select: { id: true, name: true, sapCode: true } },
        brand: { select: { id: true, name: true } },
      },
    });
  },

  update(
    tenantId: string,
    id: string,
    data: {
      branchId?: string;
      brandId?: string;
      quotaDate?: Date;
      quotaAmount?: number;
    },
  ) {
    return prisma.branchQuota.update({
      where: { id, tenantId },
      data: {
        branchId: data.branchId,
        brandId: data.brandId,
        quotaDate: data.quotaDate ? monthStart(data.quotaDate) : undefined,
        quotaAmount: data.quotaAmount,
      },
      include: {
        branch: { select: { id: true, name: true, sapCode: true } },
        brand: { select: { id: true, name: true } },
      },
    });
  },

  delete(tenantId: string, id: string) {
    return prisma.branchQuota.delete({
      where: { id, tenantId },
    });
  },
};
