import { prisma } from "@/lib/database/client";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";

export const serviceCenterRepository = {
  listByTenant(tenantId: string) {
    return prisma.serviceCenter.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        area: { select: { id: true, name: true, code: true } },
        locations: { orderBy: { code: "asc" } },
      },
      orderBy: { name: "asc" },
    });
  },

  create(
    tenantId: string,
    data: {
      sapCode: string;
      name: string;
      status?: BranchStatus;
      areaId?: string | null;
    },
  ) {
    return prisma.serviceCenter.create({
      data: {
        tenantId,
        sapCode: data.sapCode,
        name: data.name,
        status: data.status ?? "active",
        areaId: data.areaId ?? null,
      },
    });
  },

  addLocation(
    serviceCenterId: string,
    data: {
      code: string;
      name: string;
      areaId?: string | null;
      dealerAreaId?: string | null;
      regionId?: string | null;
      provinceId?: string | null;
      branchAreaId?: string | null;
    },
  ) {
    return prisma.serviceCenterLocation.create({
      data: {
        serviceCenterId,
        code: data.code,
        name: data.name,
        areaId: data.areaId ?? null,
        dealerAreaId: data.dealerAreaId ?? null,
        regionId: data.regionId ?? null,
        provinceId: data.provinceId ?? null,
        branchAreaId: data.branchAreaId ?? null,
      },
    });
  },

  softDelete(tenantId: string, id: string) {
    return prisma.serviceCenter.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  },

  deleteLocation(id: string) {
    return prisma.serviceCenterLocation.delete({ where: { id } });
  },
};
