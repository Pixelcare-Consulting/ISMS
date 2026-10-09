import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type { KpiCardItem, KpiStatusCount } from "@/lib/kpi-cards/types";

interface BuildStatusKpiItemsOptions {
  totalLabel: string;
  totalValue: number;
  statuses: KpiStatusCount[];
  /**
   * When true, status cards use StatusCodeBadge (masterdata colors) instead of
   * plain "Name (CODE)" text. Total card stays a neutral label.
   */
  statusBadges?: boolean;
}

/** Builds the "total, then one card per status" item list used by the status KPI strips. */
export function buildStatusKpiItems({
  totalLabel,
  totalValue,
  statuses,
  statusBadges = false,
}: BuildStatusKpiItemsOptions): KpiCardItem[] {
  return [
    { key: "total", label: totalLabel, value: totalValue },
    ...statuses.map((status) => ({
      key: status.code,
      label: statusBadges ? (
        <StatusCodeBadge
          code={status.code}
          name={status.name}
          color={status.color}
          showCode
          className="max-w-full whitespace-normal text-left"
        />
      ) : (
        `${status.name} (${status.code})`
      ),
      value: status.count,
    })),
  ];
}
