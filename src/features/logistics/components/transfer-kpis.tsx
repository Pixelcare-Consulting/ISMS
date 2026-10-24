import type { LogisticsKpis } from "@/features/logistics/actions/logistics.actions";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

/**
 * Working transfer path. Create starts at Pending TL, then For transfer,
 * In transit, and Accepted. Rejected is the other outcome.
 * Requested, Approved, Draft, Completed, and Cancelled stay in status settings.
 */
const TRANSFER_SUMMARY_CODES = [
  "pending_tl",
  "for_transfer",
  "in_transit",
  "accepted",
  "rejected",
] as const;

function summaryStatuses(statuses: LogisticsKpis["statuses"]): LogisticsKpis["statuses"] {
  const byCode = new Map(statuses.map((status) => [status.code, status]));
  const selected: LogisticsKpis["statuses"] = [];
  for (const code of TRANSFER_SUMMARY_CODES) {
    const status = byCode.get(code);
    if (status) selected.push(status);
  }
  return selected;
}

export function TransferKpisStrip({ kpis }: { kpis: LogisticsKpis }) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total transfers",
        totalValue: kpis.total,
        statuses: summaryStatuses(kpis.statuses),
        includeTotal: false,
        showStatusCode: false,
      })}
    />
  );
}
