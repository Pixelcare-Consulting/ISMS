import { prisma } from "@/lib/database/client";
import type { BranchStatus } from "@prisma/client";

export const branchRepository = {
  listByTenant(tenantId: string) {
    return prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        branchArea: { select: { id: true, name: true, code: true } },
        _count: { select: { aors: true, branchInventories: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.branch.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { branchArea: true },
    });
  },

  create(
    tenantId: string,
    data: {
      sapCode: string;
      name: string;
      branchAreaId?: string | null;
      deliverySchedule?: object | null;
      status?: BranchStatus;
    },
  ) {
    return prisma.branch.create({
      data: {
        tenantId,
        sapCode: data.sapCode,
        name: data.name,
        branchAreaId: data.branchAreaId ?? null,
        deliverySchedule: data.deliverySchedule ?? undefined,
        status: data.status ?? "active",
      },
    });
  },

  update(
    tenantId: string,
    id: string,
    data: {
      sapCode?: string;
      name?: string;
      branchAreaId?: string | null;
      deliverySchedule?: object | null;
      status?: BranchStatus;
    },
  ) {
    return prisma.branch.update({
      where: { id, tenantId },
      data: {
        sapCode: data.sapCode,
        name: data.name,
        branchAreaId: data.branchAreaId,
        deliverySchedule: data.deliverySchedule ?? undefined,
        status: data.status,
      },
    });
  },

  softDelete(tenantId: string, id: string) {
    return prisma.branch.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  },

  listAreas(tenantId: string) {
    return prisma.area.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
  },
};
