import { prisma } from "@/lib/database/client";

export const monthlySirPolicyRepository = {
  findByTenant(tenantId: string) {
    return prisma.monthlySirPolicy.findUnique({ where: { tenantId } });
  },

  upsert(
    tenantId: string,
    data: {
      tlMonthlyFreeSlots: number;
      psMonthlyFreeSlots: number;
    },
  ) {
    return prisma.monthlySirPolicy.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  },
};
