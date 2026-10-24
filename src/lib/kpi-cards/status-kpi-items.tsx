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
  /** When false, the total card is omitted. Status cards are unchanged. */
  includeTotal?: boolean;
  /**
   * When false, plain-text cards use the status name only.
   * Badge cards keep their own code display.
   */
  showStatusCode?: boolean;
}

function plainStatusLabel(status: KpiStatusCount, showStatusCode: boolean): string {
  if (showStatusCode) return `${status.name} (${status.code})`;
  const name = status.name.trim();
  return name || status.code;
}

/** Builds the "total, then one card per status" item list used by the status KPI strips. */
export function buildStatusKpiItems({
  totalLabel,
  totalValue,
  statuses,
  statusBadges = false,
  includeTotal = true,
  showStatusCode = true,
}: BuildStatusKpiItemsOptions): KpiCardItem[] {
  const statusItems: KpiCardItem[] = statuses.map((status) => ({
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
      plainStatusLabel(status, showStatusCode)
    ),
    value: status.count,
  }));

  if (!includeTotal) return statusItems;
  return [{ key: "total", label: totalLabel, value: totalValue }, ...statusItems];
}
