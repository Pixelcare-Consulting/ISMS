import type { InventoryGroupCountsDto } from "@/features/inventory/actions/inventory.actions";
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
}: {
  label: string;
  value: number;
  className?: string;
}) {
  if (value <= 0) return null;
  return (
    <Badge
      variant="outline"
      className={cn("tabular-nums font-normal whitespace-nowrap", className)}
    >
      {label} {value.toLocaleString()}
    </Badge>
  );
}

export function InventoryGroupCounts({
  counts,
  className,
  compact = false,
}: InventoryGroupCountsProps) {
  const size = compact ? "text-[11px] px-1.5 py-0" : undefined;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <CountBadge
        label="Avail"
        value={counts.available}
        className={cn("border-green-600/50 text-green-800", size)}
      />
      <CountBadge
        label="Def"
        value={counts.defective}
        className={cn("border-red-600/50 text-red-800", size)}
      />
      <CountBadge
        label="RSV"
        value={counts.reserved}
        className={cn("border-blue-600/50 text-blue-800", size)}
      />
      <Badge variant="secondary" className={cn("tabular-nums font-normal", size)}>
        Total {counts.total.toLocaleString()}
      </Badge>
    </div>
  );
}
