import { prisma } from "@/lib/database/client";

export type ResolvedModelPriceSource = "pricelist" | "pricelist_fallback";

export type ResolvedModelPrice = {
  amount: number;
  source: ResolvedModelPriceSource;
  /** Calendar day of the chosen price list period start (UTC YYYY-MM-DD). */
  periodStart: string;
};

function utcDayBounds(now: Date = new Date()) {
  // Date inputs store midnight UTC; treat the whole calendar day as in-range.
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayEnd = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return { dayStart, dayEnd };
}

/**
 * Resolve Model price from master price lists only (no SRP / no manual override).
 * 1) Active row for as-of day (package-specific, then generic)
 * 2) Else latest row with periodStart <= as-of day (same package preference)
 * 3) Else null → caller locks amount at 0
 */
export async function resolveModelPriceForSales(
  tenantId: string,
  modelId: string,
  packageTypeId?: string,
  asOf?: Date,
): Promise<ResolvedModelPrice | null> {
  const { dayStart, dayEnd } = utcDayBounds(asOf);
  const packageIds: Array<string | null> = packageTypeId
    ? [packageTypeId, null]
    : [null];

  for (const packageTypeFilter of packageIds) {
    const active = await prisma.priceList.findFirst({
      where: {
        tenantId,
        modelId,
        packageTypeId: packageTypeFilter,
        periodStart: { lte: dayEnd },
        periodEnd: { gte: dayStart },
      },
      orderBy: { periodStart: "desc" },
      select: { amount: true, periodStart: true },
    });
    if (active) {
      return {
        amount: Number(active.amount.toString()),
        source: "pricelist",
        periodStart: active.periodStart.toISOString().slice(0, 10),
      };
    }
  }

  for (const packageTypeFilter of packageIds) {
    const latest = await prisma.priceList.findFirst({
      where: {
        tenantId,
        modelId,
        packageTypeId: packageTypeFilter,
        periodStart: { lte: dayEnd },
      },
      orderBy: { periodStart: "desc" },
      select: { amount: true, periodStart: true },
    });
    if (latest) {
      return {
        amount: Number(latest.amount.toString()),
        source: "pricelist_fallback",
        periodStart: latest.periodStart.toISOString().slice(0, 10),
      };
    }
  }

  return null;
}
