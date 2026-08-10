import type { BranchOrderType } from "@prisma/client";

import { prisma } from "@/lib/database/client";

export type OrderingPolicyUpsertInput = {
  globalLockedWeekdays: number[];
  dailyLockEnabled: boolean;
  dailyLockStartMinutes: number | null;
  dailyLockEndMinutes: number | null;
  lockAppliesToOrderTypes: BranchOrderType[];
};

export const orderingPolicyRepository = {
  findByTenant(tenantId: string) {
    return prisma.orderingPolicy.findUnique({ where: { tenantId } });
  },

  upsert(tenantId: string, data: OrderingPolicyUpsertInput) {
    return prisma.orderingPolicy.upsert({
      where: { tenantId },
      create: {
        tenantId,
        globalLockedWeekdays: data.globalLockedWeekdays,
        dailyLockEnabled: data.dailyLockEnabled,
        dailyLockStartMinutes: data.dailyLockStartMinutes,
        dailyLockEndMinutes: data.dailyLockEndMinutes,
        lockAppliesToOrderTypes: data.lockAppliesToOrderTypes,
      },
      update: {
        globalLockedWeekdays: data.globalLockedWeekdays,
        dailyLockEnabled: data.dailyLockEnabled,
        dailyLockStartMinutes: data.dailyLockStartMinutes,
        dailyLockEndMinutes: data.dailyLockEndMinutes,
        lockAppliesToOrderTypes: data.lockAppliesToOrderTypes,
      },
    });
  },
};
