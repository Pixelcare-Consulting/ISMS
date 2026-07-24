import { prisma } from "@/lib/database/client";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";

export const dealerRepository = {
  listByTenant(tenantId: string) {
    return prisma.dealer.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        area: { select: { id: true, name: true, code: true } },
        dealerType: { select: { id: true, name: true } },
        dealerArea: { select: { id: true, name: true } },
        modeOfPayment: { select: { id: true, name: true } },
        _count: { select: { branches: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  listActiveByTenant(tenantId: string) {
    return prisma.dealer.findMany({
      where: { tenantId, deletedAt: null, status: "active" },
      include: {
        area: { select: { id: true, name: true, code: true } },
        dealerType: { select: { id: true, name: true } },
        dealerArea: { select: { id: true, name: true } },
        modeOfPayment: { select: { id: true, name: true } },
        _count: { select: { branches: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.dealer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  },

  create(
    tenantId: string,
    data: {
      name: string;
      sapCode?: string | null;
      status?: BranchStatus;
      areaId?: string | null;
      dealerTypeId?: string | null;
      dealerAreaId?: string | null;
      modeOfPaymentId?: string | null;
    },
  ) {
    return prisma.dealer.create({
      data: {
        tenantId,
        name: data.name,
        sapCode: data.sapCode ?? null,
        status: data.status ?? "active",
        areaId: data.areaId ?? null,
        dealerTypeId: data.dealerTypeId ?? null,
        dealerAreaId: data.dealerAreaId ?? null,
        modeOfPaymentId: data.modeOfPaymentId ?? null,
      },
    });
  },

  update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      sapCode?: string | null;
      status?: BranchStatus;
      areaId?: string | null;
      dealerTypeId?: string | null;
      dealerAreaId?: string | null;
      modeOfPaymentId?: string | null;
    },
  ) {
    return prisma.dealer.update({
      where: { id, tenantId },
      data,
    });
  },

  softDelete(tenantId: string, id: string) {
    return prisma.dealer.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  },
};
