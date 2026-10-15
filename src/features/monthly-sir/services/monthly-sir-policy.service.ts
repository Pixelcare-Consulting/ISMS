import {
  DEFAULT_PS_MONTHLY_FREE_SLOTS,
  DEFAULT_TL_MONTHLY_FREE_SLOTS,
} from "@/features/monthly-sir/constants/monthly-sir";
import { monthlySirPolicyRepository } from "@/features/monthly-sir/repositories/monthly-sir-policy.repository";

export interface MonthlySirPolicyConfig {
  tlMonthlyFreeSlots: number;
  psMonthlyFreeSlots: number;
}

function sanitizeSlotCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Free-slot count must be a non-negative integer (got ${String(value)}).`,
    );
  }
  if (value > 31) {
    throw new Error("Free-slot count cannot exceed 31 per month.");
  }
  return value;
}

export const monthlySirPolicyService = {
  /** Effective policy for a tenant, applying defaults when unset. */
  async getPolicy(tenantId: string): Promise<MonthlySirPolicyConfig> {
    const row = await monthlySirPolicyRepository.findByTenant(tenantId);
    return {
      tlMonthlyFreeSlots: row?.tlMonthlyFreeSlots ?? DEFAULT_TL_MONTHLY_FREE_SLOTS,
      psMonthlyFreeSlots: row?.psMonthlyFreeSlots ?? DEFAULT_PS_MONTHLY_FREE_SLOTS,
    };
  },

  /** Backend/ops upsert — no Users UI. */
  async upsertPolicy(input: {
    tenantId: string;
    tlMonthlyFreeSlots: number;
    psMonthlyFreeSlots: number;
  }) {
    const tlMonthlyFreeSlots = sanitizeSlotCount(input.tlMonthlyFreeSlots);
    const psMonthlyFreeSlots = sanitizeSlotCount(input.psMonthlyFreeSlots);
    return monthlySirPolicyRepository.upsert(input.tenantId, {
      tlMonthlyFreeSlots,
      psMonthlyFreeSlots,
    });
  },
};
