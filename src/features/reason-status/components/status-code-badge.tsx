import type { ReasonStatusCategory } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

interface StatusCodeBadgeProps {
  code: string;
  name: string;
  category?: ReasonStatusCategory;
  /** Show technical code suffix (e.g. pending_tl). Off by default in operational views. */
  showCode?: boolean;
  className?: string;
}

const WORKFLOW_VARIANTS: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  pending_tl: "border-amber-200 bg-amber-50 text-amber-800",
  pending_logistics: "border-amber-200 bg-amber-50 text-amber-800",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  in_transit: "border-sky-200 bg-sky-50 text-sky-800",
  cancelled: "border-rose-200 bg-rose-50 text-rose-800",
  partial: "border-violet-200 bg-violet-50 text-violet-800",
  draft: "border-muted bg-muted/40 text-muted-foreground",
};

export function StatusCodeBadge({
  code,
  name,
  showCode = false,
  className,
}: StatusCodeBadgeProps) {
  const variant = WORKFLOW_VARIANTS[code] ?? "border-border bg-background text-foreground";

  return (
    <Badge variant="outline" className={cn("font-normal", variant, className)}>
      {name}
      {showCode ? (
        <span className="ml-1.5 font-mono text-[10px] opacity-70">{code}</span>
      ) : null}
    </Badge>
  );
}
