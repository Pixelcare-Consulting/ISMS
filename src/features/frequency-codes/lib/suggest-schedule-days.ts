import type { DeliveryFrequencyValue } from "@/features/frequency-codes/constants";

/** Mon–Sat preferred range for delivery-day fallbacks (0=Sun … 6=Sat). */
const MON_SAT = [1, 2, 3, 4, 5, 6] as const;

/** Preferred Mon / Wed / Fri for thrice-monthly cadence. */
const THRICE_PREFERRED = [1, 3, 5] as const;

const KNOWN_FREQUENCIES = new Set<string>([
  "weekly",
  "biweekly",
  "triweekly",
  "monthly",
  "twice_weekly",
  "daily",
  "thrice_monthly",
]);

function sanitizeLocked(days: number[]): Set<number> {
  return new Set(
    [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
  );
}

function unlockedFrom(candidates: readonly number[], locked: Set<number>): number[] {
  return candidates.filter((d) => !locked.has(d));
}

function suggestDeliveryDays(
  frequency: DeliveryFrequencyValue,
  locked: Set<number>,
  unlockedMonSat: number[],
  unlockedAll: number[],
): number[] {
  switch (frequency) {
    case "twice_weekly": {
      const preferred = unlockedFrom([2, 5], locked);
      return preferred.length === 2 ? preferred : unlockedMonSat.slice(0, 2);
    }
    case "thrice_monthly": {
      const preferred = unlockedFrom(THRICE_PREFERRED, locked);
      return preferred.length === 3 ? preferred : unlockedMonSat.slice(0, 3);
    }
    case "daily": {
      // All unlocked Mon–Sat; reserve at least one unlocked day for ordering when possible.
      if (unlockedAll.length <= 1) {
        return unlockedAll.slice(0, 1);
      }
      if (!locked.has(0) && unlockedMonSat.length > 0) {
        return [...unlockedMonSat];
      }
      return unlockedAll.slice(0, -1);
    }
    case "weekly":
    case "biweekly":
    case "triweekly":
    case "monthly":
      return !locked.has(3) ? [3] : unlockedMonSat.slice(0, 1);
    default: {
      const _exhaustive: never = frequency;
      return _exhaustive;
    }
  }
}

/**
 * Suggest delivery + ordering weekdays from a frequency cadence and company locks.
 * Locked days are never suggested. Ordering days = all weekdays minus locks minus delivery.
 * Schema requires at least one ordering day — for daily, prefer Sunday if unlocked, else
 * the first leftover unlocked day (or leave delivery one short if every day is locked).
 */
export function suggestScheduleDays(params: {
  frequency: DeliveryFrequencyValue | string;
  globalLockedWeekdays: number[];
}): { deliveryDays: number[]; orderDays: number[] } {
  const locked = sanitizeLocked(params.globalLockedWeekdays);
  const unlockedMonSat = unlockedFrom(MON_SAT, locked);
  const unlockedAll = unlockedFrom([0, 1, 2, 3, 4, 5, 6], locked);

  const frequency: DeliveryFrequencyValue = KNOWN_FREQUENCIES.has(params.frequency)
    ? (params.frequency as DeliveryFrequencyValue)
    : "weekly";

  let deliveryDays = suggestDeliveryDays(frequency, locked, unlockedMonSat, unlockedAll);

  const deliverySet = new Set(deliveryDays);
  let orderDays = [0, 1, 2, 3, 4, 5, 6].filter(
    (d) => !locked.has(d) && !deliverySet.has(d),
  );

  // Guarantee ≥1 order day when any unlocked day exists (daily / heavy delivery cadences).
  if (orderDays.length === 0 && unlockedAll.length > 0) {
    const borrow = unlockedAll.find((d) => deliverySet.has(d));
    if (borrow !== undefined) {
      deliveryDays = deliveryDays.filter((d) => d !== borrow);
      orderDays = [borrow];
    } else {
      orderDays = unlockedAll.slice(0, 1);
    }
  }

  return { deliveryDays, orderDays };
}
