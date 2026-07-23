import { prisma } from "@/lib/database/client";
import type { DeliveryFrequency } from "@/lib/database/generated/prisma/client";

interface FrequencyCodeData {
  code: string;
  frequency: DeliveryFrequency;
  description: string;
}

export const frequencyCodeRepository = {
  listByTenant(tenantId: string) {
    return prisma.frequencyCode.findMany({
      where: { tenantId },
      orderBy: { code: "asc" },
      include: { _count: { select: { branchSchedules: true } } },
    });
  },

  listForOptions(tenantId: string) {
    return prisma.frequencyCode.findMany({
      where: { tenantId },
      select: { id: true, code: true, frequency: true, description: true },
      orderBy: { code: "asc" },
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.frequencyCode.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { branchSchedules: true } } },
    });
  },

  create(tenantId: string, data: FrequencyCodeData) {
    return prisma.frequencyCode.create({ data: { tenantId, ...data } });
  },

  update(tenantId: string, id: string, data: FrequencyCodeData) {
    return prisma.frequencyCode.update({ where: { id, tenantId }, data });
  },

  delete(tenantId: string, id: string) {
    return prisma.frequencyCode.delete({ where: { id, tenantId } });
  },
};
