import type { InventoryGroupCountsDto } from "@/features/inventory/actions/inventory.actions";
import {
  visibleInventoryGroupStatuses,
  type InventoryGroupStatusCount,
} from "@/features/inventory/utils/stock-units-group-aggregates";
import { statusColorClassName } from "@/features/reason-status/constants/status-colors";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

interface InventoryGroupCountsProps {
  counts: InventoryGroupCountsDto;
  className?: string;
  compact?: boolean;
}

function CountBadge({
  label,
  value,
  className,
  title,
}: {
  label: string;
  value: number;
  className?: string;
  title?: string;
}) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn("tabular-nums font-normal whitespace-nowrap", className)}
    >
      <span className="font-mono text-[10px]">{label}</span>{" "}
      {value.toLocaleString()}
    </Badge>
  );
}

/** TO FOLLOW is the name people read on the summary card; its code is FW. */
function statusChipLabel(status: InventoryGroupStatusCount): string {
  return status.code === "FW" ? status.name : status.code;
}

export function InventoryGroupCounts({
  counts,
  className,
  compact = false,
}: InventoryGroupCountsProps) {
  const size = compact ? "text-[11px] px-1.5 py-0" : "text-xs";
  const statuses = counts.statuses ?? [];
  const visibleStatuses =
    statuses.length > 0
      ? visibleInventoryGroupStatuses(statuses)
      : visibleInventoryGroupStatuses([
          {
            code: "STK",
            name: "Stock",
            color: "emerald",
            count: counts.available + counts.pendingInspection,
          },
          {
            code: "DEF",
            name: "Defective",
            color: "rose",
            count: counts.defective,
          },
          {
            code: "RSV",
            name: "Reserved",
            color: "orange",
            count: counts.reserved,
          },
        ]);
  // STK chips count only stocked-in units; the rest are still part of the total.
  const notStockedIn = counts.notStockedIn ?? 0;
  const shownTotal =
    statuses.length > 0
      ? statuses.reduce((sum, status) => sum + status.count, 0) + notStockedIn
      : counts.total;

  return (
    <div className={cn("flex max-w-xl flex-wrap items-center gap-1", className)}>
      {visibleStatuses.map((status) => (
        <CountBadge
          key={status.code}
          label={statusChipLabel(status)}
          value={status.count}
          title={`${status.name} (${status.code})`}
          className={cn(statusColorClassName(status.color, status.code), size)}
        />
      ))}
      <Badge
        variant="secondary"
        title={
          notStockedIn > 0
            ? `Includes ${notStockedIn.toLocaleString()} unit(s) with no DR# and DR date or warehouse yet`
            : undefined
        }
        className={cn("tabular-nums font-normal", size)}
      >
        Total {shownTotal.toLocaleString()}
      </Badge>
    </div>
  );
}
