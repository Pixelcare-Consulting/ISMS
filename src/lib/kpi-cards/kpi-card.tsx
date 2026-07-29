import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}

export function KpiCard({ label, value, className }: KpiCardProps) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-sm", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
