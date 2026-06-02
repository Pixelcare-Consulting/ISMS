import { prisma } from "@/lib/database/client";

export const warehouseRepository = {
  listByTenant(tenantId: string) {
    return prisma.warehouse.findMany({
      where: { tenantId },
      include: {
        locations: { orderBy: { code: "asc" } },
        _count: { select: { aors: true, pulloutsDestination: true, alternateWarehouses: true } },
      },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.warehouse.findFirst({
      where: { id, tenantId },
      include: { locations: { orderBy: { code: "asc" } } },
    });
  },

  countLinks(tenantId: string, id: string) {
    return prisma.warehouse.findFirstOrThrow({
      where: { id, tenantId },
      select: {
        _count: { select: { aors: true, pulloutsDestination: true } },
      },
    }).then((row) => row._count);
  },

  create(
    tenantId: string,
    data: { code: string; name: string; isMain?: boolean },
  ) {
    return prisma.warehouse.create({
      data: { tenantId, ...data },
      include: { locations: true },
    });
  },

  update(
    tenantId: string,
    id: string,
    data: { code?: string; name?: string; isMain?: boolean },
  ) {
    return prisma.warehouse.update({
      where: { id, tenantId },
      data,
      include: { locations: true },
    });
  },

  addLocation(warehouseId: string, data: { code: string; name: string }) {
    return prisma.warehouseLocation.create({
      data: { warehouseId, ...data },
    });
  },

  deleteWarehouse(tenantId: string, id: string) {
    return prisma.warehouse.delete({
      where: { id, tenantId },
    });
  },

  deleteLocation(warehouseId: string, locationId: string) {
    return prisma.warehouseLocation.deleteMany({
      where: { id: locationId, warehouseId },
    });
  },
};
