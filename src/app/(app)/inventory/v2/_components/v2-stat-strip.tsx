import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { cn } from "@/utils/cn";

interface V2StatStripProps {
  statuses: readonly { code: string; name: string; count: number; color?: string | null }[];
  totalUnits?: number;
  offPlanogramCount?: number;
  className?: string;
  /** Show at most this many status cards (branch mockup uses ~6). */
  maxStatusCards?: number;
}

export function V2StatStrip({
  statuses,
  totalUnits,
  offPlanogramCount = 0,
  className,
  maxStatusCards = 6,
}: V2StatStripProps) {
  const visible = statuses.slice(0, maxStatusCards);
  const showTotal = totalUnits != null;
  if (!showTotal && visible.length === 0 && offPlanogramCount === 0) return null;

  return (
    <div
      className={cn(
        "grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8",
        className,
      )}
    >
      {showTotal ? (
        <div className="rounded-xl border border-border/80 bg-card px-3 py-3 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Total units</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{totalUnits.toLocaleString()}</p>
        </div>
      ) : null}
      {visible.map((status) => (
        <div
          key={status.code}
          className="rounded-xl border border-border/80 bg-card px-3 py-3 shadow-sm"
        >
          <div className="flex items-center gap-1.5">
            <StatusCodeBadge
              code={status.code}
              name={status.name}
              color={status.color ?? undefined}
              showCode
              className="scale-90"
            />
          </div>
          <p className="mt-2 text-xl font-semibold tabular-nums">{status.count.toLocaleString()}</p>
        </div>
      ))}
      {offPlanogramCount > 0 || showTotal ? (
        <div
          className={cn(
            "rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-3 shadow-sm",
            "dark:border-amber-900/60 dark:bg-amber-950/35",
          )}
        >
          <p className="text-xs font-medium text-amber-900 dark:text-amber-100">Off planogram</p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-amber-950 dark:text-amber-50">
            {offPlanogramCount.toLocaleString()}
          </p>
        </div>
      ) : null}
    </div>
  );
}
