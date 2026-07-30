import type { DeliveryFrequencyValue } from "@/features/frequency-codes/constants";

/** Mon–Sat preferred range for delivery-day fallbacks (0=Sun … 6=Sat). */
const MON_SAT = [1, 2, 3, 4, 5, 6] as const;

function sanitizeLocked(days: number[]): Set<number> {
  return new Set(
    [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
  );
}

function unlockedFrom(candidates: readonly number[], locked: Set<number>): number[] {
  return candidates.filter((d) => !locked.has(d));
}

/**
 * Suggest delivery + ordering weekdays from a frequency cadence and company locks.
 * Locked days are never suggested. Ordering days = all weekdays minus locks minus delivery.
 */
export function suggestScheduleDays(params: {
  frequency: DeliveryFrequencyValue | string;
  globalLockedWeekdays: number[];
}): { deliveryDays: number[]; orderDays: number[] } {
  const locked = sanitizeLocked(params.globalLockedWeekdays);
  const unlockedMonSat = unlockedFrom(MON_SAT, locked);

  let deliveryDays: number[];
  if (params.frequency === "twice_weekly") {
    const preferred = unlockedFrom([2, 5], locked);
    deliveryDays = preferred.length === 2 ? preferred : unlockedMonSat.slice(0, 2);
  } else {
    // weekly / biweekly / triweekly / monthly (and unknown single-day cadences)
    deliveryDays = !locked.has(3) ? [3] : unlockedMonSat.slice(0, 1);
  }

  const deliverySet = new Set(deliveryDays);
  const orderDays = [0, 1, 2, 3, 4, 5, 6].filter(
    (d) => !locked.has(d) && !deliverySet.has(d),
  );

  return { deliveryDays, orderDays };
}
