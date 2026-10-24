import { Loader2 } from "lucide-react";

import { cn } from "@/utils/cn";

interface ReportingLoadingProps {
  /** Current step, e.g. "Loading report data". */
  label: string;
  className?: string;
}

/** Centered loading state for report and dashboard frames; fills its parent. */
export function ReportingLoading({ label, className }: ReportingLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center", className)}
    >
      <Loader2 aria-hidden className="size-8 animate-spin text-primary" />
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">The first load can take a few seconds.</p>
    </div>
  );
}
