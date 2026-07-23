import { auditService } from "@/features/audit/services/audit.service";
import { orderingPolicyRepository } from "@/features/ordering/repositories/ordering-policy.repository";
import { DEFAULT_LOCKED_WEEKDAYS } from "@/features/orders/utils/order-window";

function sanitizeWeekdays(days: number[]): number[] {
  return [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
}

export const orderingPolicyService = {
  /** Effective policy for a tenant, applying the default lock when unset. */
  async getPolicy(tenantId: string): Promise<{ globalLockedWeekdays: number[] }> {
    const row = await orderingPolicyRepository.findByTenant(tenantId);
    return { globalLockedWeekdays: row?.globalLockedWeekdays ?? DEFAULT_LOCKED_WEEKDAYS };
  },

  async updatePolicy(input: {
    tenantId: string;
    actorUserId: string;
    globalLockedWeekdays: number[];
  }) {
    const globalLockedWeekdays = sanitizeWeekdays(input.globalLockedWeekdays);
    const policy = await orderingPolicyRepository.upsert(input.tenantId, globalLockedWeekdays);
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "ordering_policy.updated",
      entityType: "OrderingPolicy",
      entityId: policy.id,
      metadata: { globalLockedWeekdays },
    });
    return policy;
  },
};
