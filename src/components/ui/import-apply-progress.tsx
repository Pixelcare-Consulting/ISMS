"use client";

import { cn } from "@/utils/cn";

function formatEta(remainingMs: number): string {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  if (seconds < 60) return `~${seconds}s left`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes === 1) return "~1 min left";
  return `~${minutes} min left`;
}

function etaFromRate(processed: number, total: number, elapsedMs: number): string | null {
  if (total <= 0 || processed <= 0 || processed >= total || elapsedMs < 2_000) {
    return null;
  }
  // Wait until a few chunks have finished so the rate is meaningful.
  const minSamples = Math.min(80, Math.max(20, Math.floor(total * 0.05)));
  if (processed < minSamples) return null;
  const rate = processed / elapsedMs;
  if (rate <= 0) return null;
  return formatEta((total - processed) / rate);
}

export function ImportApplyProgress({
  label,
  processed,
  total,
  elapsedMs,
  className,
}: {
  label: string;
  processed: number;
  total: number;
  /** Elapsed apply time in ms, measured by the parent when progress updates. */
  elapsedMs?: number;
  className?: string;
}) {
  const safeTotal = Math.max(0, total);
  const safeProcessed = Math.min(Math.max(0, processed), safeTotal || processed);
  const pct =
    safeTotal <= 0 ? 100 : Math.min(100, Math.round((safeProcessed / safeTotal) * 100));
  const etaLabel =
    elapsedMs != null ? etaFromRate(safeProcessed, safeTotal, elapsedMs) : null;

  return (
    <div className={cn("space-y-2", className)} role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {safeProcessed} of {safeTotal}
          {etaLabel ? ` · ${etaLabel}` : ""}
        </span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Please keep this page open — do not refresh or close until the import finishes.
      </p>
    </div>
  );
}
