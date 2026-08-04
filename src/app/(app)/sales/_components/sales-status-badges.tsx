import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

const ATR_LABELS: Record<string, string> = {
  open: "Open",
  reserve: "Reserve",
  closed: "Closed",
};

const ATR_VARIANTS: Record<string, string> = {
  open: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  reserve:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  closed:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
};

const RETURN_LABELS: Record<string, string> = {
  pending_cs: "Pending CS",
  pending_tl: "Pending TL",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

const RETURN_VARIANTS: Record<string, string> = {
  pending_cs:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  pending_tl:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  approved:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  rejected:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  completed:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
};

interface AtrStatusBadgeProps {
  status: string;
  className?: string;
}

export function AtrStatusBadge({ status, className }: AtrStatusBadgeProps) {
  const label = ATR_LABELS[status] ?? status;
  const variant =
    ATR_VARIANTS[status] ?? "border-border bg-background text-foreground";

  return (
    <Badge variant="outline" className={cn("font-medium", variant, className)}>
      {label}
    </Badge>
  );
}

interface ReturnStatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function ReturnStatusBadge({ status, className }: ReturnStatusBadgeProps) {
  if (!status) {
    return <span className="text-muted-foreground">—</span>;
  }

  const label = RETURN_LABELS[status] ?? status;
  const variant =
    RETURN_VARIANTS[status] ?? "border-border bg-background text-foreground";

  return (
    <Badge variant="outline" className={cn("font-medium", variant, className)}>
      {label}
    </Badge>
  );
}
