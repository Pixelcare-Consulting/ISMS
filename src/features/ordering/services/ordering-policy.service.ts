import type { BranchOrderType } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { orderingPolicyRepository } from "@/features/ordering/repositories/ordering-policy.repository";
import {
  ALL_LOCK_ORDER_TYPES,
  DEFAULT_LOCK_APPLIES_TO,
  DEFAULT_LOCKED_WEEKDAYS,
  type OrderingPolicyConfig,
} from "@/features/orders/utils/order-window";

function sanitizeWeekdays(days: number[]): number[] {
  return [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
}

function sanitizeAppliesTo(types: BranchOrderType[]): BranchOrderType[] {
  const allowed = new Set<BranchOrderType>(ALL_LOCK_ORDER_TYPES);
  const unique = [...new Set(types)].filter((t) => allowed.has(t));
  if (unique.length === 0) {
    throw new Error("Select at least one order module for company locks.");
  }
  return ALL_LOCK_ORDER_TYPES.filter((t) => unique.includes(t));
}

function sanitizeDailyLock(input: {
  dailyLockEnabled: boolean;
  dailyLockStartMinutes: number | null;
  dailyLockEndMinutes: number | null;
}): {
  dailyLockEnabled: boolean;
  dailyLockStartMinutes: number | null;
  dailyLockEndMinutes: number | null;
} {
  if (!input.dailyLockEnabled) {
    return {
      dailyLockEnabled: false,
      dailyLockStartMinutes: input.dailyLockStartMinutes,
      dailyLockEndMinutes: input.dailyLockEndMinutes,
    };
  }

  const start = input.dailyLockStartMinutes;
  const end = input.dailyLockEndMinutes;
  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > 1439 ||
    start >= end
  ) {
    throw new Error(
      "Daily time lock requires a start and end time, with start earlier than end (same day, Manila).",
    );
  }

  return {
    dailyLockEnabled: true,
    dailyLockStartMinutes: start,
    dailyLockEndMinutes: end,
  };
}

export const orderingPolicyService = {
  /** Effective policy for a tenant, applying the default lock when unset. */
  async getPolicy(tenantId: string): Promise<OrderingPolicyConfig> {
    const row = await orderingPolicyRepository.findByTenant(tenantId);
    return {
      globalLockedWeekdays: row?.globalLockedWeekdays ?? DEFAULT_LOCKED_WEEKDAYS,
      dailyLockEnabled: row?.dailyLockEnabled ?? false,
      dailyLockStartMinutes: row?.dailyLockStartMinutes ?? null,
      dailyLockEndMinutes: row?.dailyLockEndMinutes ?? null,
      lockAppliesToOrderTypes:
        row?.lockAppliesToOrderTypes?.length
          ? row.lockAppliesToOrderTypes
          : DEFAULT_LOCK_APPLIES_TO,
    };
  },

  async updatePolicy(input: {
    tenantId: string;
    actorUserId: string;
    globalLockedWeekdays: number[];
    dailyLockEnabled: boolean;
    dailyLockStartMinutes: number | null;
    dailyLockEndMinutes: number | null;
    lockAppliesToOrderTypes: BranchOrderType[];
  }) {
    const globalLockedWeekdays = sanitizeWeekdays(input.globalLockedWeekdays);
    const lockAppliesToOrderTypes = sanitizeAppliesTo(input.lockAppliesToOrderTypes);
    const daily = sanitizeDailyLock({
      dailyLockEnabled: input.dailyLockEnabled,
      dailyLockStartMinutes: input.dailyLockStartMinutes,
      dailyLockEndMinutes: input.dailyLockEndMinutes,
    });
    const policy = await orderingPolicyRepository.upsert(input.tenantId, {
      globalLockedWeekdays,
      lockAppliesToOrderTypes,
      ...daily,
    });
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "ordering_policy.updated",
      entityType: "OrderingPolicy",
      entityId: policy.id,
      metadata: {
        globalLockedWeekdays,
        lockAppliesToOrderTypes,
        dailyLockEnabled: daily.dailyLockEnabled,
        dailyLockStartMinutes: daily.dailyLockStartMinutes,
        dailyLockEndMinutes: daily.dailyLockEndMinutes,
      },
    });
    return policy;
  },
};
