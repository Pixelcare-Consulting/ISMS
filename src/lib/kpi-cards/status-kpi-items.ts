import type { KpiCardItem, KpiStatusCount } from "@/lib/kpi-cards/types";

interface BuildStatusKpiItemsOptions {
  totalLabel: string;
  totalValue: number;
  statuses: KpiStatusCount[];
}

/** Builds the "total, then one card per status" item list used by the status KPI strips. */
export function buildStatusKpiItems({
  totalLabel,
  totalValue,
  statuses,
}: BuildStatusKpiItemsOptions): KpiCardItem[] {
  return [
    { key: "total", label: totalLabel, value: totalValue },
    ...statuses.map((status) => ({
      key: status.code,
      label: `${status.name} (${status.code})`,
      value: status.count,
    })),
  ];
}
