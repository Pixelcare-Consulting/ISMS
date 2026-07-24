import { prisma } from "@/lib/database/client";

export const orderingPolicyRepository = {
  findByTenant(tenantId: string) {
    return prisma.orderingPolicy.findUnique({ where: { tenantId } });
  },

  upsert(tenantId: string, globalLockedWeekdays: number[]) {
    return prisma.orderingPolicy.upsert({
      where: { tenantId },
      create: { tenantId, globalLockedWeekdays },
      update: { globalLockedWeekdays },
    });
  },
};
