import { auditService } from "@/features/audit/services/audit.service";
import { orderingPolicyRepository } from "@/features/ordering/repositories/ordering-policy.repository";
import {
  DEFAULT_LOCKED_WEEKDAYS,
  type OrderingPolicyConfig,
} from "@/features/orders/utils/order-window";

function sanitizeWeekdays(days: number[]): number[] {
  return [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
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
    };
  },

  async updatePolicy(input: {
    tenantId: string;
    actorUserId: string;
    globalLockedWeekdays: number[];
    dailyLockEnabled: boolean;
    dailyLockStartMinutes: number | null;
    dailyLockEndMinutes: number | null;
  }) {
    const globalLockedWeekdays = sanitizeWeekdays(input.globalLockedWeekdays);
    const daily = sanitizeDailyLock({
      dailyLockEnabled: input.dailyLockEnabled,
      dailyLockStartMinutes: input.dailyLockStartMinutes,
      dailyLockEndMinutes: input.dailyLockEndMinutes,
    });
    const policy = await orderingPolicyRepository.upsert(input.tenantId, {
      globalLockedWeekdays,
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
        dailyLockEnabled: daily.dailyLockEnabled,
        dailyLockStartMinutes: daily.dailyLockStartMinutes,
        dailyLockEndMinutes: daily.dailyLockEndMinutes,
      },
    });
    return policy;
  },
};
